//! 批次數值核心。可重用的 f64 線性緩衝區，索引契約與 bridge.js 配對。
use super::{cross,dot,norm,output,EPS};
use std::cell::RefCell;
type V=[f64;3];
thread_local! {static INPUT:RefCell<Vec<f64>>=const{RefCell::new(Vec::new())};}
#[no_mangle]
pub extern "C" fn kernel_version()->u32{1}
#[no_mangle]
pub extern "C" fn input_resize(len:usize)->*mut f64{
    if len>1_000_000{return std::ptr::null_mut();}
    INPUT.with(|b|{let mut b=b.borrow_mut();b.resize(len,0.0);b.as_mut_ptr()})
}
fn get(b:&[f64],i:usize)->V{[b[i],b[i+1],b[i+2]]}
fn put(b:&mut[f64],i:usize,v:V){b[i..i+3].copy_from_slice(&v);}
fn minus(a:V,b:V)->V{std::array::from_fn(|k|a[k]-b[k])}
fn direction(a:V)->V{let n=norm(&a);if n>EPS{a.map(|v|v/n)}else{[1.0,0.0,0.0]}}
fn ease(t:f64)->f64{let t=t.clamp(0.0,1.0);t*t*t*(t*(t*6.0-15.0)+10.0)}
fn rotate(p:V,a:usize,b:usize,angle:f64)->V{let mut q=p;let(s,c)=angle.sin_cos();q[a]=c*p[a]-s*p[b];q[b]=s*p[a]+c*p[b];q}
fn movement(p:&mut V,v:&mut V,steering:&mut V,dir:V,speed:f64,dt:f64,response:f64,bounds:V){
    let mut desired=direction(dir).map(|v|v*speed);
    for k in 0..3{desired[k]-=p[k].signum()*(p[k].abs()-bounds[k]*0.78).max(0.0)*2.5;}
    let length=norm(&desired);let factor=if length>speed{speed/length}else{1.0};
    let turn=1.0-(-3.0*dt).exp();let follow=1.0-(-response*dt).exp();
    for k in 0..3{
        steering[k]+=(desired[k]*factor-steering[k])*turn;
        v[k]+=(steering[k]-v[k])*follow;p[k]+=v[k]*dt;
        if p[k].abs()>bounds[k]{p[k]=p[k].signum()*bounds[k];v[k]*=-0.3;}
    }
}
// Header: dt, speed, response, bounds[3]; body: position,velocity,steering,direction.
#[no_mangle]
pub extern "C" fn move_agent(){INPUT.with(|b|{let mut b=b.borrow_mut();if b.len()!=18{return;}
    let(mut p,mut v,mut s)=(get(&b,6),get(&b,9),get(&b,12));
    movement(&mut p,&mut v,&mut s,get(&b,15),b[1],b[0],b[2],get(&b,3));put(&mut b,6,p);put(&mut b,9,v);put(&mut b,12,s);
});}
// Prey header 16: dt, visible, danger, birthDuration, bounds[3], hunter pos[3], vel[3], count.
// Record 24: pos[3],vel[3],steering[3],direction[3],energy,mode,alive,birth,
//   rhythm[3] (stroke speed multiplier, zig-zag axis 1, axis 2; computed by JS so sin/cos stay identical),
//   startle at 19, active at 23. Slot 14 is "alive" (neighbours may include a prey that respawned this step).
// Flock constants below must match FLOCK / startle rules in sketch.js; tests/rust-parity.cjs checks them.
#[no_mangle]
pub extern "C" fn prey_step(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<16{return;}
    let n=b[13] as usize;if n>4096||b.len()!=16+n*24{return;}
    let(dt,visible,danger)=(b[0],b[1]!=0.0,b[2]);let bounds=get(&b,4);let hp=get(&b,7);let hv=get(&b,10);
    for i in 0..n{let o=16+i*24;if b[o+23]==0.0{b[o+14]=b[o+22];continue;}
        b[o+15]=(b[o+15]+dt).min(b[3]);if b[o+13]==3.0{continue;}
        let mut p=get(&b,o);let mut v=get(&b,o+3);let mut steer=get(&b,o+6);let own=get(&b,o+9);
        let flee=visible&&norm(&minus(p,hp))<danger;
        let startle=if flee&&b[o+13]!=1.0{1.0}else{(b[o+19]-dt*2.2).max(0.0)};b[o+19]=startle;
        b[o+12]=(b[o+12]+dt*if flee{-0.09}else{0.07}).clamp(0.0,1.0);
        let mode=if flee{1.0}else if b[o+12]<0.45{2.0}else{0.0};b[o+13]=mode;
        let mut dir=own;
        if flee{let predicted=std::array::from_fn(|k|hp[k]+hv[k]*0.35);let escape=direction(minus(p,predicted));
            let helper=if escape[1].abs()<0.9{[0.0,1.0,0.0]}else{[1.0,0.0,0.0]};
            let s1=direction(cross(&escape,&helper));let s2=cross(&escape,&s1);
            dir=std::array::from_fn(|k|escape[k]*2.0+own[k]*0.65+s1[k]*b[o+17]*0.9+s2[k]*b[o+18]*0.5);}
        let gain=if flee{3.2}else{1.8};let mut centre=[0.0;3];let mut heading=[0.0;3];let mut mates=0.0;
        for j in 0..n{let other=16+j*24;if i==j||b[other+14]==0.0{continue;}
            let op=get(&b,other);let offset=minus(p,op);let d=norm(&offset);
            if d<55.0{let away=direction(offset);for k in 0..3{dir[k]+=away[k]*(1.0-d/55.0)*gain;}}
            if d<150.0&&b[other+13]!=3.0{mates+=1.0;for k in 0..3{centre[k]+=op[k];}
                let ov=get(&b,other+3);let s=norm(&ov);if s>1.0{for k in 0..3{heading[k]+=ov[k]/s;}}}
        }
        if !flee&&mates>0.0{
            let to:V=std::array::from_fn(|k|centre[k]/mates-p[k]);let gap=norm(&to);
            if gap>45.0{for k in 0..3{dir[k]+=to[k]/gap*0.5;}}
            let aligned=norm(&heading);if aligned>EPS{for k in 0..3{dir[k]+=heading[k]/aligned*0.7;}}
        }
        let base=if flee{60.0+70.0*b[o+12]}else if mode==2.0{26.0}else{48.0};
        movement(&mut p,&mut v,&mut steer,dir,base*b[o+16]*(1.0+1.4*startle),dt,4.0+10.0*startle,bounds);
        put(&mut b,o,p);put(&mut b,o+3,v);put(&mut b,o+6,steer);
    }
});}
// Collision header: count, passes, restitution, bounds[3]. Record 12: pos,vel,radius,mass,active,alive.
#[no_mangle]
pub extern "C" fn collisions(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<6{return;}
    let n=b[0] as usize;let passes=(b[1] as usize).min(3);if n>4096||b.len()!=6+n*12{return;}
    let restitution=b[2];let bounds=get(&b,3);let mut impacts=Vec::new();
    for _ in 0..passes{
        for i in 0..n{let a=6+i*12;if b[a+8]==0.0{continue;}
            for j in i+1..n{let c=6+j*12;if b[c+8]==0.0{continue;}
                let offset=minus(get(&b,c),get(&b,a));let distance=norm(&offset);let radius=b[a+6]+b[c+6];if distance>=radius{continue;}
                let normal=direction(offset);let ia=1.0/b[a+7];let ib=1.0/b[c+7];let total=ia+ib;
                for k in 0..3{b[a+k]-=normal[k]*(radius-distance)*ia/total;b[c+k]+=normal[k]*(radius-distance)*ib/total;}
                let closing=dot(&minus(get(&b,c+3),get(&b,a+3)),&normal);
                if closing<0.0{let impulse=-(1.0+restitution)*closing/total;
                    for k in 0..3{b[a+3+k]-=normal[k]*impulse*ia;b[c+3+k]+=normal[k]*impulse*ib;}
                    if closing< -8.0{for k in 0..3{impacts.push(b[a+k]+normal[k]*b[a+6]);}}
                }
            }
        }
        for i in 0..n{let o=6+i*12;if b[o+9]==0.0{continue;}
            for k in 0..3{if b[o+k].abs()>bounds[k]{b[o+k]=b[o+k].signum()*bounds[k];if b[o+k]*b[o+3+k]>0.0{b[o+3+k]*=-restitution;}}}
        }
    }output(impacts);
});}
// Fragment header 24: dt,age,internal,scatter,ramp,viscosity,restitution,nodeRadius,lineWidth,
// hunter pos[3],vel[3],normal[3],surface,count. Record 24: pos,vel,half,hasHalf,spin,swirlAxis,
// driftPhase,driftFreq,driftAmp,swirlSpeed,wavePhase,waveFreq,waveAmp,absorbed.
#[no_mangle]
pub extern "C" fn fragments(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<24{return;}
    let count=b[19] as usize;if count>16384||b.len()!=24+count*24{return;}
    let(dt,age,internal)=(b[0],b[1],b[2]!=0.0);let scatter=if internal{0.12}else{b[3]};let attraction=age>scatter;
    let pull=((age-scatter)/b[4]).clamp(0.0,1.0);let drag=if attraction{9.5}else{b[5]};
    let hp=get(&b,9);let hv=get(&b,12);let normal=get(&b,15);
    for i in 0..count{let o=24+i*24;if b[o+21]!=0.0{continue;}
        let mut p=get(&b,o);let mut v=get(&b,o+3);let to=minus(hp,p);let dist=norm(&to);let inward=direction(to);
        let raw=cross(&inward,&get(&b,o+11));let swirl=direction(if norm(&raw)>EPS{raw}else{[0.0,1.0,0.0]});let wave=direction(cross(&inward,&swirl));
        let ss=if attraction{b[o+17]*pull*(0.25+dist/26.0).min(1.8)}else{0.0};
        let ws=if attraction{b[o+20]*pull*(age*b[o+19]+b[o+18]).sin()*(0.2+dist/24.0).min(1.5)}else{0.0};
        let ins=if attraction{(32.0+dist*0.72)*pull}else{0.0};
        let phase=age*b[o+15]+b[o+14];let amp=if attraction{0.0}else{b[o+16]};let drift=[phase.cos()*amp*0.7,phase.sin()*amp,(phase*0.7).sin()*amp*0.5];
        for k in 0..3{let acceleration=if attraction{(inward[k]*ins+swirl[k]*ss+wave[k]*ws-v[k])*drag}else{-v[k]*drag+drift[k]};v[k]+=acceleration*dt;p[k]+=v[k]*dt;}
        if !attraction&&!internal{
            let half=rotate(rotate(get(&b,o+6),0,2,age*b[o+10]),1,2,age*b[o+10]*0.7);
            let extent=if b[o+9]!=0.0{dot(&half,&normal).abs()+b[8]/2.0}else{b[7]};
            let penetration=b[18]+extent-dot(&minus(p,hp),&normal);
            if penetration>0.0{for k in 0..3{p[k]+=normal[k]*penetration;}let incoming=dot(&minus(v,hv),&normal);
                if incoming<0.0{for k in 0..3{v[k]-=(1.0+b[6])*incoming*normal[k];}}
            }
        }
        put(&mut b,o,p);put(&mut b,o+3,v);if attraction&&norm(&minus(p,hp))<7.0{b[o+21]=1.0;}
    }
});}
// Transform header 24: count,stretch,scale,tilt,turn,motionAxis[3],cageOpen,cageAxis[3].
#[no_mangle]
pub extern "C" fn transform(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<24{return;}
    let n=b[0] as usize;if b.len()!=24+n*3{return;}
    let axis=get(&b,5);let ca=get(&b,9);let side=1.0/b[1].sqrt();let tangent=direction(cross(&ca,&if ca[1].abs()<0.9{[0.0,1.0,0.0]}else{[1.0,0.0,0.0]}));let bitangent=cross(&ca,&tangent);
    for i in 0..n{let o=24+i*3;let p=get(&b,o);let along=dot(&p,&axis);
        let q=std::array::from_fn(|k|(p[k]*side+axis[k]*along*(b[1]-side))*b[2]);let mut q=rotate(rotate(q,0,1,b[3]),0,2,b[4]);
        if b[8]>0.0{let z=dot(&q,&ca);let front=ease((z+35.0)/140.0);let radial:V=std::array::from_fn(|k|q[k]-ca[k]*z);let r=norm(&radial);
            let angle=dot(&radial,&bitangent).atan2(dot(&radial,&tangent));let opening=b[8]*front;let spread=1.0+opening*1.05*(0.85+0.15*(angle*4.0).cos());let depth=z-opening*(30.0+z*0.22);
            q=std::array::from_fn(|k|ca[k]*depth+radial[k]*spread+if r<1.0{0.0}else{radial[k]/r*opening*24.0});
        }put(&mut b,o,q);
    }
});}
// Small mesh header: count,angleXZ,angleYZ,size,position[3], then XYZ points.
#[no_mangle]
pub extern "C" fn small_points(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<7{return;}
    let n=b[0] as usize;if b.len()!=7+n*3{return;}
    for i in 0..n{let o=7+i*3;let p=rotate(rotate(get(&b,o),0,2,b[1]),1,2,b[2]);let p=std::array::from_fn(|k|p[k]*b[3]+b[4+k]);put(&mut b,o,p);}
});}
// Camera-facing circles: header count,segments,right[3],up[3]; record center[3],radius.
#[no_mangle]
pub extern "C" fn rings(){INPUT.with(|buf|{let b=buf.borrow();if b.len()<8{return;}
    let n=b[0] as usize;let segments=b[1] as usize;if n>8192||segments>64||b.len()!=8+n*4{return;}
    let mut result=Vec::with_capacity(n*segments*3);
    let angles:Vec<_>=(0..segments).map(|j|(j as f64/segments as f64*std::f64::consts::TAU).sin_cos()).collect();
    for i in 0..n{let o=8+i*4;for &(s,c) in &angles{for k in 0..3{result.push(b[o+k]+b[o+3]*(c*b[2+k]+s*b[5+k]));}}}output(result);
});}
// Impact/birth geometry: birth,t,radius,center[3]. 3*40 circle vertices then 24 spoke vertices.
#[no_mangle]
pub extern "C" fn life_geometry(){INPUT.with(|buf|{let b=buf.borrow();if b.len()!=6{return;}
    let mut data=Vec::with_capacity(432);
    for (a,c) in [(0,1),(1,2),(0,2)]{for i in 0..40{
        let angle=i as f64/40.0*std::f64::consts::TAU;let ripple=if b[0]!=0.0{1.0}else{1.0+0.07*(angle*6.0+b[1]*12.0).sin()};
        let mut p=get(&b,3);p[a]+=angle.cos()*b[2]*ripple;p[c]+=angle.sin()*b[2]*ripple;data.extend(p);
    }}
    for i in 0..12{let z=1.0-2.0*(i as f64+0.5)/12.0;let angle=i as f64*2.399963;let r=(1.0-z*z).sqrt();let dir=[r*angle.cos(),r*angle.sin(),z];
        for d in [b[2],b[2]+7.0*(1.0-b[1])]{for k in 0..3{data.push(b[3+k]+dir[k]*d);}}
    }output(data);
});}
// Fragment display: count,age,scatter,nodeRadius,hunter[3],right[3],up[3]; records pos,half,spin,hasHalf.
#[no_mangle]
pub extern "C" fn fragment_geometry(){INPUT.with(|buf|{let b=buf.borrow();if b.len()<13{return;}
    let n=b[0] as usize;if b.len()!=13+n*8{return;}
    let mut data=Vec::new();let hp=get(&b,4);
    for i in 0..n{let o=13+i*8;let p=get(&b,o);let shrink=if b[1]>b[2]{(norm(&minus(p,hp))/25.0).min(1.0)}else{1.0};
        if b[o+7]!=0.0{let half=rotate(rotate(get(&b,o+3),0,2,b[1]*b[o+6]),1,2,b[1]*b[o+6]*0.7);
            for sign in [-1.0,1.0]{for k in 0..3{data.push(p[k]+sign*half[k]*shrink);}}
        }else{for j in 0..16{let a=j as f64/16.0*std::f64::consts::TAU;let(s,c)=a.sin_cos();for k in 0..3{data.push(p[k]+b[3]*shrink*(c*b[7+k]+s*b[10+k]));}}}
    }output(data);
});}
// Squashed prey: count,normal[3],center[3],compression,bulge, then base points.
#[no_mangle]
pub extern "C" fn squish_geometry(){INPUT.with(|buf|{let mut b=buf.borrow_mut();if b.len()<9{return;}
    let n=b[0] as usize;if b.len()!=9+n*3{return;}
    let normal=get(&b,1);let center=get(&b,4);
    for i in 0..n{let o=9+i*3;let p=get(&b,o);let proj=dot(&p,&normal);let q=std::array::from_fn(|k|center[k]+normal[k]*proj*b[7]+(p[k]-normal[k]*proj)*b[8]);put(&mut b,o,q);}
});}

