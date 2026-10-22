//! 截游體的純數值核心。輸出暫存在同一個緩衝區，JS 必須在下次呼叫前複製。
use std::cell::RefCell;
const EPS: f64 = 1e-7;
thread_local! { static OUTPUT: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) }; }
fn output(values: Vec<f64>) { OUTPUT.with(|o| *o.borrow_mut() = values); }
#[no_mangle]
pub extern "C" fn result_ptr() -> *const f64 { OUTPUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn result_len() -> usize { OUTPUT.with(|o| o.borrow().len()) }
fn dot(a: &[f64], b: &[f64]) -> f64 { a.iter().zip(b).map(|(x,y)| x*y).sum() }
fn sub(a: &[f64], b: &[f64]) -> [f64;3] { [a[0]-b[0],a[1]-b[1],a[2]-b[2]] }
fn cross(a: &[f64], b: &[f64]) -> [f64;3] { [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]] }
fn norm(a: &[f64]) -> f64 { dot(a,a).sqrt() }
fn unit(a: [f64;3]) -> [f64;3] { let n=norm(&a); a.map(|x|x/n) }
fn rotate(mut p: [f64;4], a: usize, b: usize, angle: f64) -> [f64;4] {
    let (s,c)=angle.sin_cos(); let x=p[a]; let y=p[b]; p[a]=c*x-s*y; p[b]=s*x+c*y; p
}
fn face_order(ids: &[usize], points: &[[f64;4]]) -> Option<Vec<usize>> {
    if ids.len()<3 { return None; }
    let center=std::array::from_fn::<_,3,_>(|k|ids.iter().map(|&i|points[i][k]).sum::<f64>()/ids.len() as f64);
    let u=unit(sub(&points[ids[0]],&center));
    let normal=ids.iter().skip(1).map(|&i|cross(&u,&sub(&points[i],&center))).find(|n|norm(n)>EPS).map(unit)?;
    if ids.iter().any(|&i|dot(&sub(&points[i],&center),&normal).abs()>EPS*10.0) { return None; }
    let v=cross(&normal,&u); let mut ordered=ids.to_vec();
    let angle=|i:usize| {let p=sub(&points[i],&center);dot(&p,&v).atan2(dot(&p,&u))};
    ordered.sort_by(|a,b|angle(*a).total_cmp(&angle(*b))); Some(ordered)
}
fn add_point(points: &mut Vec<[f64;4]>, p: [f64;4]) -> usize {
    // 與 JavaScript Math.round 相同：半整數朝正無窮方向捨入。
    let key=|q: &[f64;4]|[0,1,2].map(|k|(q[k]/EPS+0.5).floor());
    if let Some(i)=points.iter().position(|q|key(q)==key(&p)) { i }
    else {points.push(p);points.len()-1}
}
/// 一次處理整個母體，避免每個頂點各自跨越 JS/Wasm 邊界。
/// 格式：點數、邊數、面數、每點四座標、每邊兩索引、各面長度及索引。
#[no_mangle]
pub extern "C" fn geometry(time:f64, level:f64, half:f64, speed:f64, distance:f64, slice:f64, projection:u32) {
    let mut base=Vec::new();
    for i in 0..4 {for j in i+1..4 {for a in [-1.0,1.0] {for b in [-1.0,1.0] {
        let mut p=[0.0;4];p[i]=a;p[j]=b;base.push(p);
    }}}}
    let mut edges=Vec::new();
    for i in 0..24 {for j in i+1..24 {
        let d: f64=(0..4).map(|k|{let x=base[i][k]-base[j][k];x*x}).sum();
        if (d-2.0).abs()<EPS {edges.push([i,j]);}
    }}
    let vertices:Vec<_>=base.iter().map(|p|{
        let mut p=p.map(|x|x*half*level);
        for (a,b,angle) in [(0,3,0.52+time*speed),(1,3,0.78+0.6*(time*0.17).sin()),(2,3,0.31+time*0.13),(0,2,0.27)] {p=rotate(p,a,b,angle);}
        p
    }).collect();
    let mut points=Vec::new();let mut faces:Vec<Vec<usize>>=Vec::new();let mut result_edges=Vec::new();
    if projection!=0 {
        if distance<=2.0_f64.sqrt()*half*level { output(Vec::new());return; }
        points=vertices.iter().map(|p|{let k=distance/(distance-p[3]);[p[0]*k,p[1]*k,p[2]*k,p[3]]}).collect();
        result_edges=edges;
    } else {
        let mut normals=Vec::new();
        for axis in 0..4 {for sign in [-1.0,1.0] {let mut n=[0.0;4];n[axis]=sign;normals.push(n);}}
        for mask in 0..16 {normals.push(std::array::from_fn(|k|if mask&(1<<k)!=0 {0.5}else{-0.5}));}
        for normal in normals {
            let belongs=|i:usize|(dot(&normal,&base[i])-1.0).abs()<EPS;
            let mut ids=Vec::new();
            for &[i,j] in &edges {
                if !belongs(i)||!belongs(j) {continue;}
                let a=vertices[i];let b=vertices[j];let da=a[3]-slice;let db=b[3]-slice;
                let mut candidates=Vec::new();
                if da.abs()<EPS {candidates.push([a[0],a[1],a[2],slice]);}
                if db.abs()<EPS {candidates.push([b[0],b[1],b[2],slice]);}
                if da*db<0.0&&da.abs()>=EPS&&db.abs()>=EPS {
                    let t=(slice-a[3])/(b[3]-a[3]);let mut p=std::array::from_fn(|k|a[k]+t*(b[k]-a[k]));p[3]=slice;candidates.push(p);
                }
                for p in candidates {let id=add_point(&mut points,p);if !ids.contains(&id) {ids.push(id);}}
            }
            if let Some(face)=face_order(&ids,&points) {
                let mut key=face.clone();key.sort_unstable();
                if !faces.iter().any(|f|{let mut k=f.clone();k.sort_unstable();k==key}) {faces.push(face);}
            }
        }
        for face in &faces {for i in 0..face.len() {
            let a=face[i];let b=face[(i+1)%face.len()];
            if !result_edges.iter().any(|&e|e==[a,b]||e==[b,a]) {result_edges.push([a,b]);}
        }}
    }
    let mut data=vec![points.len() as f64,result_edges.len() as f64,faces.len() as f64];
    for p in points {data.extend(p);}
    for edge in result_edges {data.extend(edge.map(|i|i as f64));}
    for face in faces {data.push(face.len() as f64);data.extend(face.iter().map(|&i|i as f64));}
    // 投影模式需要原始四維座標，供診斷與驗證使用。
    if projection!=0 {for p in vertices {data.extend(p);}}
    output(data);
}
/// 有限線段最近點，保留平行、零長度、端點夾限的既有行為。
#[no_mangle]
pub extern "C" fn contact(ax:f64,ay:f64,az:f64,bx:f64,by:f64,bz:f64,cx:f64,cy:f64,cz:f64,dx:f64,dy:f64,dz:f64) {
    let p=[ax,ay,az];let q=[bx,by,bz];let r0=[cx,cy,cz];let q2=[dx,dy,dz];
    let d1=sub(&q,&p);let d2=sub(&q2,&r0);let r=sub(&p,&r0);
    let a=dot(&d1,&d1);let e=dot(&d2,&d2);let f=dot(&d2,&r);let mut s=0.0;let mut t=0.0;
    if a<=EPS {if e>EPS {t=(f/e).clamp(0.0,1.0);}}
    else {let c=dot(&d1,&r);
        if e<=EPS {s=(-c/a).clamp(0.0,1.0);}
        else {let b=dot(&d1,&d2);let denom=a*e-b*b;
            if denom>EPS {s=((b*f-c*e)/denom).clamp(0.0,1.0);}
            t=(b*s+f)/e;
            if t<0.0 {t=0.0;s=(-c/a).clamp(0.0,1.0);}else if t>1.0 {t=1.0;s=((b-c)/a).clamp(0.0,1.0);}
        }
    }
    let first=std::array::from_fn::<_,3,_>(|k|p[k]+d1[k]*s);let second=std::array::from_fn::<_,3,_>(|k|r0[k]+d2[k]*t);
    let mut data=first.to_vec();data.extend(second);data.push(norm(&sub(&first,&second)));output(data);
}
