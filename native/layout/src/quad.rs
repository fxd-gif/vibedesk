//! Quadtree für Barnes-Hut: ferne Gruppen von Knoten wirken wie ein einziger Knoten in ihrem Ladungs-Schwerpunkt.
//! Wird in jedem Schritt neu gebaut (Knoten bewegen sich), in einer Arena ohne Einzel-Allokationen.

#[derive(Clone, Copy, Default)]
struct Cell {
    /// Seitenlänge des Quadrats
    size: f64,
    /// Schwerpunkt, gewichtet mit |Ladung|
    cx: f64,
    cy: f64,
    /// Summe der Ladungen
    value: f64,
    /// Kinder (Index in der Arena, 0 = keins) – Blatt, wenn alle 0
    kids: [u32; 4],
    /// Blatt: Bereich in `points`
    start: u32,
    end: u32,
}

#[derive(Default)]
pub struct QuadTree {
    cells: Vec<Cell>,
    points: Vec<u32>,
    stack: Vec<u32>,
}

/// tiefer wird nicht geteilt – dort liegen Punkte (fast) aufeinander und landen gemeinsam in einem Blatt
const MAX_DEPTH: u32 = 40;

impl QuadTree {
    pub fn build(&mut self, x: &[f64], y: &[f64], charge: &[f64]) {
        self.cells.clear();
        self.points.clear();
        let n = x.len();
        if n == 0 {
            return;
        }
        self.points.extend(0..n as u32);
        let (mut x0, mut y0, mut x1, mut y1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        for i in 0..n {
            x0 = x0.min(x[i]);
            y0 = y0.min(y[i]);
            x1 = x1.max(x[i]);
            y1 = y1.max(y[i]);
        }
        let size = (x1 - x0).max(y1 - y0).max(1e-9) * 1.0001;
        // Zelle 0 ist die Wurzel; „0 = kein Kind“ ist eindeutig, weil die Wurzel nie Kind ist
        self.cells.push(Cell::default());
        self.split(0, 0, n, x0, y0, size, 0, x, y, charge);
    }

    #[allow(clippy::too_many_arguments)]
    fn split(&mut self, cell: usize, a: usize, b: usize, x0: f64, y0: f64, size: f64, depth: u32, x: &[f64], y: &[f64], charge: &[f64]) {
        let mut c = Cell { size, start: a as u32, end: b as u32, ..Cell::default() };
        if b - a > 1 && depth < MAX_DEPTH {
            let h = size / 2.0;
            let (mx, my) = (x0 + h, y0 + h);
            // in vier Gruppen sortieren: links oben, rechts oben, links unten, rechts unten
            let quad = |i: u32| -> usize { (x[i as usize] >= mx) as usize | (((y[i as usize] >= my) as usize) << 1) };
            self.points[a..b].sort_unstable_by_key(|&i| quad(i));
            let mut s = a;
            for q in 0..4 {
                let mut e = s;
                while e < b && quad(self.points[e]) == q {
                    e += 1;
                }
                if e > s {
                    let id = self.cells.len();
                    self.cells.push(Cell::default());
                    c.kids[q] = id as u32;
                    let (qx, qy) = (if q & 1 == 1 { mx } else { x0 }, if q & 2 == 2 { my } else { y0 });
                    self.split(id, s, e, qx, qy, h, depth + 1, x, y, charge);
                }
                s = e;
            }
            // Schwerpunkt aus den Kindern
            let (mut wsum, mut sx, mut sy, mut v) = (0.0, 0.0, 0.0, 0.0);
            for &k in &c.kids {
                if k == 0 {
                    continue;
                }
                let kc = &self.cells[k as usize];
                let w = kc.value.abs();
                v += kc.value;
                wsum += w;
                sx += kc.cx * w;
                sy += kc.cy * w;
            }
            c.value = v;
            if wsum > 0.0 {
                c.cx = sx / wsum;
                c.cy = sy / wsum;
            }
        } else {
            let (mut wsum, mut sx, mut sy, mut v) = (0.0, 0.0, 0.0, 0.0);
            for &i in &self.points[a..b] {
                let i = i as usize;
                let w = charge[i].abs();
                v += charge[i];
                wsum += w;
                sx += x[i] * w;
                sy += y[i] * w;
            }
            c.value = v;
            if wsum > 0.0 {
                c.cx = sx / wsum;
                c.cy = sy / wsum;
            } else {
                c.cx = x[a.min(x.len() - 1)];
                c.cy = y[a.min(y.len() - 1)];
            }
        }
        self.cells[cell] = c;
    }

    /// Kraft auf Knoten i (ohne alpha): Summe über ferne Zellen als Schwerpunkt, nahe einzeln
    #[allow(clippy::too_many_arguments)]
    pub fn force(&mut self, i: usize, xi: f64, yi: f64, x: &[f64], y: &[f64], charge: &[f64], theta2: f64, dmin2: f64, dmax2: f64) -> (f64, f64) {
        let (mut ax, mut ay) = (0.0, 0.0);
        if self.cells.is_empty() {
            return (0.0, 0.0);
        }
        // winzige feste Verschiebung statt Zufall, falls Punkte exakt aufeinanderliegen
        let nudge = ((i % 7) as f64 - 3.0) * 1e-6 + 1e-7;
        self.stack.clear();
        self.stack.push(0);
        while let Some(id) = self.stack.pop() {
            let c = self.cells[id as usize];
            if c.value == 0.0 {
                continue;
            }
            let leaf = c.kids == [0; 4];
            let dx = c.cx - xi;
            let dy = c.cy - yi;
            let l = dx * dx + dy * dy;
            if c.size * c.size / theta2 < l {
                // weit genug weg: die ganze Zelle wirkt wie ein Punkt
                if l < dmax2 {
                    let l = if l < dmin2 { (dmin2 * l).sqrt() } else { l };
                    ax += dx * c.value / l;
                    ay += dy * c.value / l;
                }
                continue;
            }
            if !leaf {
                for &k in &c.kids {
                    if k != 0 {
                        self.stack.push(k);
                    }
                }
                continue;
            }
            for &j in &self.points[c.start as usize..c.end as usize] {
                let j = j as usize;
                if j == i {
                    continue;
                }
                let mut dx = x[j] - xi;
                let mut dy = y[j] - yi;
                if dx == 0.0 {
                    dx = nudge;
                }
                if dy == 0.0 {
                    dy = nudge;
                }
                let mut l = dx * dx + dy * dy;
                if l >= dmax2 {
                    continue;
                }
                if l < dmin2 {
                    l = (dmin2 * l).sqrt();
                }
                ax += dx * charge[j] / l;
                ay += dy * charge[j] / l;
            }
        }
        (ax, ay)
    }
}
