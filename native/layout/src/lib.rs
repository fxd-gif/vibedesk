//! Kräfte-Layout für den Gehirn-Graphen von VibeDesk – dieselben Kräfte wie die bisherige d3-force-Konfiguration:
//! Federn (Links), Abstoßung (Barnes-Hut-Quadtree), Kollision (Raster), Zentrierung und leichter Zug zur Mitte.
//! Läuft als WebAssembly in einem Web Worker; die Zustände liegen in Arrays, die JavaScript direkt im Speicher sieht.
//!
//! Ablauf je Schritt wie in d3: Kräfte ändern die Geschwindigkeit, dann `v *= decay` und `x += v`.

pub mod quad;

use quad::QuadTree;

/// Einstellungen – Standardwerte wie in BrainGraph.tsx
#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Barnes-Hut-Genauigkeit θ² (d3: 0,81)
    pub theta2: f64,
    /// Abstoßung wirkt nur bis zu dieser Entfernung (zum Quadrat)
    pub dist_max2: f64,
    /// Mindestabstand² gegen Unendlich bei fast gleichen Punkten
    pub dist_min2: f64,
    /// Schwerpunkt Richtung (0,0) schieben, Anteil je Schritt
    pub center: f64,
    /// forceX/forceY Richtung 0
    pub gravity: f64,
    /// Geschwindigkeit bleibt zu diesem Anteil erhalten (d3: 1 − 0,4)
    pub decay: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params { theta2: 0.81, dist_max2: 420.0 * 420.0, dist_min2: 1.0, center: 0.05, gravity: 0.035, decay: 0.6 }
    }
}

pub struct Layout {
    pub n: usize,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub vx: Vec<f64>,
    pub vy: Vec<f64>,
    /// Kollisionsradius (Knotenradius + Luft)
    pub r: Vec<f64>,
    /// Ladung: negativ = Abstoßung
    pub charge: Vec<f64>,
    /// festgehaltene Position (gezogener Knoten), NaN = frei
    pub fx: Vec<f64>,
    pub fy: Vec<f64>,
    pub src: Vec<u32>,
    pub dst: Vec<u32>,
    pub dist: Vec<f64>,
    pub strength: Vec<f64>,
    bias: Vec<f64>,
    pub params: Params,
    seed: u32,
    tree: QuadTree,
    /// Raster für die Kollision: Zellen-Schlüssel je Knoten, sortierte Reihenfolge
    keys: Vec<(u64, u32)>,
}

impl Layout {
    pub fn new(n: usize, m: usize) -> Self {
        Layout {
            n,
            x: vec![f64::NAN; n],
            y: vec![f64::NAN; n],
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            r: vec![1.0; n],
            charge: vec![-30.0; n],
            fx: vec![f64::NAN; n],
            fy: vec![f64::NAN; n],
            src: vec![0; m],
            dst: vec![0; m],
            dist: vec![30.0; m],
            strength: vec![1.0; m],
            bias: vec![0.5; m],
            params: Params::default(),
            seed: 1,
            tree: QuadTree::default(),
            keys: Vec::with_capacity(n),
        }
    }

    /// Nach dem Befüllen: Gewichtung der Federn und Startplätze für Knoten ohne Position (Spirale wie in d3)
    pub fn prepare(&mut self) {
        let mut count = vec![0u32; self.n];
        for i in 0..self.src.len() {
            let (s, t) = (self.src[i] as usize, self.dst[i] as usize);
            if s >= self.n || t >= self.n {
                continue;
            }
            count[s] += 1;
            count[t] += 1;
        }
        for i in 0..self.src.len() {
            let (s, t) = (self.src[i] as usize, self.dst[i] as usize);
            if s >= self.n || t >= self.n {
                continue;
            }
            self.bias[i] = count[s] as f64 / (count[s] + count[t]) as f64;
        }
        let angle = std::f64::consts::PI * (3.0 - 5f64.sqrt());
        for i in 0..self.n {
            if self.x[i].is_nan() || self.y[i].is_nan() {
                let rad = 10.0 * (0.5 + i as f64).sqrt();
                let a = i as f64 * angle;
                self.x[i] = rad * a.cos();
                self.y[i] = rad * a.sin();
            }
            if !self.vx[i].is_finite() || !self.vy[i].is_finite() {
                self.vx[i] = 0.0;
                self.vy[i] = 0.0;
            }
        }
    }

    /// winziger Zufallsschubs für exakt aufeinanderliegende Punkte (deterministisch)
    fn jiggle(&mut self) -> f64 {
        self.seed = self.seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        ((self.seed >> 8) as f64 / (1u32 << 24) as f64 - 0.5) * 1e-6
    }

    pub fn tick(&mut self, alpha: f64) {
        if self.n == 0 {
            return;
        }
        self.links(alpha);
        self.many_body(alpha);
        self.collide();
        self.center();
        let g = self.params.gravity * alpha;
        for i in 0..self.n {
            self.vx[i] -= self.x[i] * g;
            self.vy[i] -= self.y[i] * g;
        }
        let d = self.params.decay;
        for i in 0..self.n {
            if self.fx[i].is_nan() {
                self.vx[i] *= d;
                self.x[i] += self.vx[i];
            } else {
                self.x[i] = self.fx[i];
                self.vx[i] = 0.0;
            }
            if self.fy[i].is_nan() {
                self.vy[i] *= d;
                self.y[i] += self.vy[i];
            } else {
                self.y[i] = self.fy[i];
                self.vy[i] = 0.0;
            }
        }
    }

    /// Federn: zieht verbundene Knoten auf ihre Wunschlänge (d3 forceLink, eine Iteration)
    fn links(&mut self, alpha: f64) {
        for i in 0..self.src.len() {
            let (s, t) = (self.src[i] as usize, self.dst[i] as usize);
            if s >= self.n || t >= self.n || s == t {
                continue;
            }
            let mut x = self.x[t] + self.vx[t] - self.x[s] - self.vx[s];
            let mut y = self.y[t] + self.vy[t] - self.y[s] - self.vy[s];
            if x == 0.0 {
                x = self.jiggle();
            }
            if y == 0.0 {
                y = self.jiggle();
            }
            let len = (x * x + y * y).sqrt();
            let l = (len - self.dist[i]) / len * alpha * self.strength[i];
            x *= l;
            y *= l;
            let b = self.bias[i];
            self.vx[t] -= x * b;
            self.vy[t] -= y * b;
            self.vx[s] += x * (1.0 - b);
            self.vy[s] += y * (1.0 - b);
        }
    }

    /// Abstoßung aller gegen alle, entfernte Gruppen als ein Schwerpunkt (Barnes-Hut wie d3 forceManyBody)
    fn many_body(&mut self, alpha: f64) {
        self.tree.build(&self.x, &self.y, &self.charge);
        let p = self.params;
        for i in 0..self.n {
            let (ax, ay) = self.tree.force(i, self.x[i], self.y[i], &self.x, &self.y, &self.charge, p.theta2, p.dist_min2, p.dist_max2);
            self.vx[i] += ax * alpha;
            self.vy[i] += ay * alpha;
        }
    }

    /// Kollision über ein Raster: jede Zelle ist so groß wie der größte Durchmesser, Nachbarn liegen in den 3×3 Zellen
    fn collide(&mut self) {
        let n = self.n;
        let max_r = self.r.iter().cloned().fold(0.0, f64::max);
        if max_r <= 0.0 {
            return;
        }
        let cell = 2.0 * max_r;
        let key = |cx: i64, cy: i64| -> u64 { ((cx as i32 as u32 as u64) << 32) | (cy as i32 as u32 as u64) };
        self.keys.clear();
        for i in 0..n {
            let px = self.x[i] + self.vx[i];
            let py = self.y[i] + self.vy[i];
            self.keys.push((key((px / cell).floor() as i64, (py / cell).floor() as i64), i as u32));
        }
        self.keys.sort_unstable();
        // Zelle → Bereich in keys
        let find = |keys: &[(u64, u32)], k: u64| -> std::ops::Range<usize> {
            let a = keys.partition_point(|e| e.0 < k);
            let b = keys.partition_point(|e| e.0 <= k);
            a..b
        };
        for i in 0..n {
            let ri = self.r[i];
            let ri2 = ri * ri;
            let xi = self.x[i] + self.vx[i];
            let yi = self.y[i] + self.vy[i];
            let (cx, cy) = ((xi / cell).floor() as i64, (yi / cell).floor() as i64);
            for dx in -1..=1 {
                for dy in -1..=1 {
                    let range = find(&self.keys, key(cx + dx, cy + dy));
                    for e in range {
                        let j = self.keys[e].1 as usize;
                        // jedes Paar einmal (wie d3: nur höhere Indizes)
                        if j <= i {
                            continue;
                        }
                        let rj = self.r[j];
                        let r = ri + rj;
                        let mut x = xi - self.x[j] - self.vx[j];
                        let mut y = yi - self.y[j] - self.vy[j];
                        let mut l = x * x + y * y;
                        if l >= r * r {
                            continue;
                        }
                        if x == 0.0 {
                            x = self.jiggle();
                            l += x * x;
                        }
                        if y == 0.0 {
                            y = self.jiggle();
                            l += y * y;
                        }
                        let len = l.sqrt();
                        let f = (r - len) / len;
                        x *= f;
                        y *= f;
                        let rj2 = rj * rj;
                        let w = rj2 / (ri2 + rj2);
                        self.vx[i] += x * w;
                        self.vy[i] += y * w;
                        self.vx[j] -= x * (1.0 - w);
                        self.vy[j] -= y * (1.0 - w);
                    }
                }
            }
        }
    }

    /// Schwerpunkt Richtung (0,0) schieben (d3 forceCenter mit Stärke)
    fn center(&mut self) {
        let (mut sx, mut sy) = (0.0, 0.0);
        for i in 0..self.n {
            sx += self.x[i];
            sy += self.y[i];
        }
        let k = self.params.center;
        let (sx, sy) = (sx / self.n as f64 * k, sy / self.n as f64 * k);
        for i in 0..self.n {
            self.x[i] -= sx;
            self.y[i] -= sy;
        }
    }
}

// ---------- Schnittstelle für WebAssembly: rohe Zeiger, JavaScript liest und schreibt die Arrays direkt ----------

#[unsafe(no_mangle)]
pub extern "C" fn layout_new(n: u32, m: u32) -> *mut Layout {
    Box::into_raw(Box::new(Layout::new(n as usize, m as usize)))
}

/// # Safety
/// `l` muss von `layout_new` stammen und darf danach nicht mehr benutzt werden.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn layout_free(l: *mut Layout) {
    if !l.is_null() {
        drop(unsafe { Box::from_raw(l) });
    }
}

macro_rules! field_ptr {
    ($name:ident, $field:ident, $t:ty) => {
        /// # Safety
        /// `l` muss ein gültiger Zeiger aus `layout_new` sein.
        #[unsafe(no_mangle)]
        pub unsafe extern "C" fn $name(l: *mut Layout) -> *mut $t {
            unsafe { (*l).$field.as_mut_ptr() }
        }
    };
}
field_ptr!(layout_x, x, f64);
field_ptr!(layout_y, y, f64);
field_ptr!(layout_vx, vx, f64);
field_ptr!(layout_vy, vy, f64);
field_ptr!(layout_r, r, f64);
field_ptr!(layout_charge, charge, f64);
field_ptr!(layout_fx, fx, f64);
field_ptr!(layout_fy, fy, f64);
field_ptr!(layout_src, src, u32);
field_ptr!(layout_dst, dst, u32);
field_ptr!(layout_dist, dist, f64);
field_ptr!(layout_strength, strength, f64);

/// # Safety
/// `l` muss ein gültiger Zeiger aus `layout_new` sein.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn layout_prepare(l: *mut Layout) {
    unsafe { (*l).prepare() }
}

/// # Safety
/// `l` muss ein gültiger Zeiger aus `layout_new` sein.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn layout_tick(l: *mut Layout, alpha: f64) {
    unsafe { (*l).tick(alpha) }
}

#[cfg(test)]
mod tests;
