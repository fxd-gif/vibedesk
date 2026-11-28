use super::*;

fn grid_graph(n: usize) -> Layout {
    // Kette plus Querverbindungen, alle Knoten ohne Startposition
    let mut src = vec![];
    let mut dst = vec![];
    for i in 1..n {
        src.push((i - 1) as u32);
        dst.push(i as u32);
        if i >= 7 {
            src.push((i - 7) as u32);
            dst.push(i as u32);
        }
    }
    let mut l = Layout::new(n, src.len());
    l.src = src;
    l.dst = dst;
    for i in 0..l.src.len() {
        l.dist[i] = 60.0;
        l.strength[i] = 0.4;
    }
    for i in 0..n {
        l.r[i] = 8.0;
        l.charge[i] = -200.0;
    }
    l.prepare();
    l
}

fn settle(l: &mut Layout, ticks: usize) {
    let mut alpha = 1.0;
    for _ in 0..ticks {
        alpha += (0.0 - alpha) * 0.03;
        l.tick(alpha);
    }
}

#[test]
fn startplaetze_ohne_position_sind_verschieden_und_endlich() {
    let l = grid_graph(50);
    for i in 0..50 {
        assert!(l.x[i].is_finite() && l.y[i].is_finite());
        for j in 0..i {
            assert!((l.x[i] - l.x[j]).abs() + (l.y[i] - l.y[j]).abs() > 1e-6);
        }
    }
}

#[test]
fn pendelt_ein_ohne_nan_und_ohne_ueberlappung() {
    let mut l = grid_graph(300);
    settle(&mut l, 300);
    let mut worst: f64 = 0.0;
    for i in 0..l.n {
        assert!(l.x[i].is_finite() && l.y[i].is_finite(), "Knoten {i} ist NaN");
        for j in 0..i {
            let d = ((l.x[i] - l.x[j]).powi(2) + (l.y[i] - l.y[j]).powi(2)).sqrt();
            worst = worst.max(l.r[i] + l.r[j] - d);
        }
    }
    // Kollision hält Abstand (kleine Restüberlappung erlaubt, wie bei d3)
    assert!(worst < 4.0, "stärkste Überlappung {worst}");
}

#[test]
fn verbundene_knoten_liegen_naeher_als_zufaellige_paare() {
    let mut l = grid_graph(200);
    settle(&mut l, 300);
    let d = |a: usize, b: usize| ((l.x[a] - l.x[b]).powi(2) + (l.y[a] - l.y[b]).powi(2)).sqrt();
    let linked: f64 = (0..l.src.len()).map(|i| d(l.src[i] as usize, l.dst[i] as usize)).sum::<f64>() / l.src.len() as f64;
    let mut all = 0.0;
    let mut c = 0;
    for i in (0..200).step_by(7) {
        for j in (0..200).step_by(11) {
            if i != j {
                all += d(i, j);
                c += 1;
            }
        }
    }
    assert!(linked < all / c as f64 * 0.5, "verbunden {linked}, Durchschnitt {}", all / c as f64);
}

#[test]
fn schwerpunkt_bleibt_in_der_mitte() {
    let mut l = grid_graph(150);
    for i in 0..l.n {
        l.x[i] += 500.0;
    }
    settle(&mut l, 300);
    let mx = l.x.iter().sum::<f64>() / l.n as f64;
    let my = l.y.iter().sum::<f64>() / l.n as f64;
    assert!(mx.abs() < 15.0 && my.abs() < 15.0, "Schwerpunkt {mx} {my}");
}

#[test]
fn festgehaltener_knoten_bleibt_wo_er_ist() {
    let mut l = grid_graph(40);
    l.fx[5] = 123.0;
    l.fy[5] = -45.0;
    settle(&mut l, 50);
    assert_eq!((l.x[5], l.y[5]), (123.0, -45.0));
}

#[test]
fn barnes_hut_kommt_der_exakten_summe_nahe() {
    let mut l = grid_graph(400);
    settle(&mut l, 80);
    // ohne Reichweiten-Grenze vergleichen: an der Grenze weichen Zelle und Einzelpunkte naturgemäß ab (wie bei d3)
    l.params.dist_max2 = f64::INFINITY;
    let p = l.params;
    l.tree.build(&l.x, &l.y, &l.charge);
    let mut err = 0.0;
    let mut mag = 0.0;
    for i in (0..l.n).step_by(13) {
        let (ax, ay) = l.tree.force(i, l.x[i], l.y[i], &l.x, &l.y, &l.charge, p.theta2, p.dist_min2, p.dist_max2);
        let (mut ex, mut ey) = (0.0, 0.0);
        for j in 0..l.n {
            if j == i {
                continue;
            }
            let (dx, dy) = (l.x[j] - l.x[i], l.y[j] - l.y[i]);
            let d2 = dx * dx + dy * dy;
            if d2 < p.dist_max2 {
                ex += dx * l.charge[j] / d2;
                ey += dy * l.charge[j] / d2;
            }
        }
        err += ((ax - ex).powi(2) + (ay - ey).powi(2)).sqrt();
        mag += (ex * ex + ey * ey).sqrt();
    }
    assert!(err / mag < 0.15, "relativer Fehler {}", err / mag);
}

#[test]
fn ein_einzelner_knoten_und_ein_leerer_graph_gehen() {
    let mut l = Layout::new(0, 0);
    l.prepare();
    l.tick(1.0);
    let mut l = Layout::new(1, 0);
    l.prepare();
    l.tick(1.0);
    assert!(l.x[0].is_finite());
}
