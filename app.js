import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
let currentUser=null, currentProfile=null, selectedVisit=null;
let patientsCache=[], doctorsCache=[];

const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const fmtDate=v=>v?new Date(v).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"";
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const toast=msg=>{const t=$("toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",2500)};
const showModal=id=>$(id).classList.remove("hidden"); const hideModal=id=>$(id).classList.add("hidden");
const isAnon=()=>Boolean(currentUser?.is_anonymous || currentUser?.user_metadata?.is_anonymous);
function friendlyError(e){return e?.message||e?.details||e?.hint||"Operation failed."}
function requireConfig(){if(SUPABASE_URL.startsWith("YOUR_")||SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_"))throw new Error("Supabase is not configured yet. Add your Project URL and Publishable key to supabase-config.js.")}

function showDoctorLogin(){
  $("appView").classList.add("hidden");$("doctorLoginView").classList.remove("hidden");$("loginError").textContent="";$("email").focus();
}
function showReception(){
  $("doctorLoginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("roleLabel").textContent="RECEPTION";$("userEmail").textContent="Reception";applyRoleUI();openPage("reception");
}
function applyRoleUI(){
  const doctor=currentProfile?.role==="doctor", admin=currentProfile?.role==="admin";
  document.querySelectorAll(".doctor-only").forEach(x=>x.classList.toggle("hidden",!doctor));
  document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!admin));
  $("doctorLoginNav").classList.toggle("hidden",!isAnon());
}

async function getProfile(uid){const {data,error}=await sb.from("profiles").select("id,name,role").eq("id",uid).maybeSingle();if(error)throw error;if(!data)throw new Error("No profile found for this login. Create a profiles row with this Auth user's UID and role doctor/admin.");return data}

async function ensureReception(){
  requireConfig();
  const {data:{session}}=await sb.auth.getSession();
  if(session?.user)return session.user;
  const {data,error}=await sb.auth.signInAnonymously();
  if(error)throw new Error("Reception login failed. Enable Anonymous Sign-Ins in Supabase Authentication.");
  return data.user;
}

async function openPage(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  const target=$(page); if(!target)return; target.classList.remove("hidden");
  document.querySelectorAll(".nav[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  try{
    if(page==="reception"){await loadAppointments();await loadRefunds();}
    if(page==="patients")await loadPatients();
    if(page==="appointments")await loadAppointments();
    if(page==="doctor")await loadDoctorPatients();
  }catch(e){console.error(e);alert(friendlyError(e))}
}

document.querySelectorAll(".nav[data-page]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.page)));
$("doctorLoginNav").addEventListener("click",showDoctorLogin);
document.querySelectorAll(".backReception").forEach(b=>b.addEventListener("click",async()=>{try{if(!isAnon())await sb.auth.signOut();await ensureReception();showReception()}catch(e){alert(friendlyError(e))}}));
$("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();await ensureReception();showReception()});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>hideModal(b.dataset.close)));

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();$("loginError").textContent="";
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
    if(error)throw error;
    currentUser=data.user;currentProfile=await getProfile(currentUser.id);
    if(!["doctor","admin"].includes(currentProfile.role))throw new Error("This account is not assigned the doctor/admin role.");
    $("doctorLoginView").classList.add("hidden");$("appView").classList.remove("hidden");$("roleLabel").textContent=currentProfile.role.toUpperCase();$("userEmail").textContent=currentUser.email||"";applyRoleUI();await openPage(currentProfile.role==="doctor"?"doctor":"admin");
  }catch(err){console.error(err);$("loginError").textContent=friendlyError(err)}
});

async function loadDoctors(){const {data,error}=await sb.from("doctors").select("id,name,active").eq("active",true).order("name");if(error)throw error;doctorsCache=data||[];if(!doctorsCache.length)throw new Error("No active doctors found. Add the doctor to the doctors table.")}
async function loadPatients(){
  const nameQ=$("patientSearch").value.trim().toLowerCase(), placeQ=$("patientPlaceSearch").value.trim().toLowerCase();
  let q=sb.from("patients").select("*").order("created_at",{ascending:false}).limit(500);
  if(nameQ)q=q.or(`name.ilike.%${nameQ}%,mobile.ilike.%${nameQ}%`);
  if(placeQ)q=q.ilike("address",`%${placeQ}%`);
  const {data,error}=await q;if(error)throw error;patientsCache=data||[];
  $("patientList").innerHTML=patientsCache.length?patientsCache.map(p=>`<div class="item"><div><h3>${esc(p.name)}</h3><p>${esc(p.age)} years · ${esc(p.gender)} · ${esc(p.mobile||"-")} · ${esc(p.address||"-")}</p></div><div class="item-actions"><button class="outline" data-view-patient="${p.id}">View</button><button class="primary" data-book-patient="${p.id}">Book</button></div></div>`).join(""):"<div class='panel'>No matching patients.</div>";
  document.querySelectorAll("[data-view-patient]").forEach(b=>b.onclick=()=>viewPatient(b.dataset.viewPatient));
  document.querySelectorAll("[data-book-patient]").forEach(b=>b.onclick=()=>openBooking(b.dataset.bookPatient));
}
$("patientSearch").addEventListener("input",loadPatients);$("patientPlaceSearch").addEventListener("input",loadPatients);

function openPatientForm(){
  $("patientModalTitle").textContent="New Patient";$("patientId").value="";$("patientForm").reset();showModal("patientModal");$("pName").focus();
}
$("newBookingBtn").addEventListener("click",openPatientForm);

$("patientForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const row={name:$("pName").value.trim(),age:Number($("pAge").value),gender:$("pGender").value,mobile:$("pMobile").value.trim()||null,address:$("pAddress").value.trim()||null,blood_pressure:$("pBP").value.trim()||null};
    const {data,error}=await sb.from("patients").insert(row).select().single();if(error)throw error;
    hideModal("patientModal");toast("Patient saved. Now create the booking.");await loadPatients();await openBooking(data.id);
  }catch(err){console.error(err);alert(friendlyError(err))}
});

async function openBooking(patientId=null){
  try{await loadDoctors();const {data,error}=await sb.from("patients").select("id,name,mobile").order("name").limit(500);if(error)throw error;patientsCache=data||[];
    $("bPatient").innerHTML=patientsCache.map(p=>`<option value="${p.id}">${esc(p.name)} — ${esc(p.mobile||"")}</option>`).join("");
    $("bDoctor").innerHTML=doctorsCache.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("");
    if(patientId)$("bPatient").value=patientId;
    $("bTime").value=new Date().toTimeString().slice(0,5);$("bPayment").value="Cash";$("upiTimeWrap").classList.add("hidden");$("bUpiTime").required=false;showModal("bookingModal");
  }catch(err){alert(friendlyError(err))}
}
$("bPayment").addEventListener("change",()=>{const upi=$("bPayment").value==="UPI";$("upiTimeWrap").classList.toggle("hidden",!upi);$("bUpiTime").required=upi});
$("bookingForm").addEventListener("submit",async e=>{
  e.preventDefault();try{const p=patientsCache.find(x=>x.id===$("bPatient").value),d=doctorsCache.find(x=>x.id===$("bDoctor").value);if(!p||!d)throw new Error("Select a patient and doctor.");const row={patient_id:p.id,patient_name:p.name,doctor_id:d.id,doctor_name:d.name,date_key:todayKey(),time:$("bTime").value,fee:Number($("bFee").value),payment_method:$("bPayment").value,upi_payment_time:$("bPayment").value==="UPI"?$("bUpiTime").value:null,status:"waiting",created_by:currentUser.id};const {error}=await sb.from("appointments").insert(row);if(error)throw error;hideModal("bookingModal");toast("Booking created.");await loadAppointments();await loadRefunds();}catch(err){console.error(err);alert(friendlyError(err))}
});

async function loadAppointments(){
  const {data,error}=await sb.from("appointments").select("*").order("time",{ascending:true}).limit(500);if(error)throw error;const arr=data||[];const today=arr.filter(a=>a.date_key===todayKey());
  const render=a=>`<div class="item"><div><h3>${esc(a.patient_name)}</h3><p>${esc(a.time)} · Dr. ${esc(a.doctor_name)} · ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.payment_method)}</p></div><span class="badge ${a.status==='seen'?'seen':'waiting'}">${esc(a.status||'waiting')}</span></div>`;
  $("receptionBookings").innerHTML=today.length?today.map(render).join(""):"<div class='panel'>No bookings today.</div>";
  $("appointmentList").innerHTML=arr.length?arr.map(render).join(""):"<div class='panel'>No bookings found.</div>";
  $("statBookings").textContent=today.length;$("statWaiting").textContent=today.filter(a=>a.status==='waiting').length;$("statSeen").textContent=today.filter(a=>a.status==='seen').length;
}

async function loadDoctorPatients(){
  $("doctorList").innerHTML="<div class='panel'>Loading today's patients…</div>";
  const {data,error}=await sb.from("appointments").select("*").eq("doctor_id",currentUser.id).eq("date_key",todayKey()).order("time",{ascending:true});if(error){$("doctorList").innerHTML=`<div class='panel error'>${esc(friendlyError(error))}</div>`;return}
  $("doctorList").innerHTML=data?.length?data.map(a=>`<div class="item"><div><h3>${esc(a.patient_name)}</h3><p>${esc(a.time)} · Fee ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.payment_method)}</p></div><div class="item-actions"><span class="badge ${a.status==='seen'?'seen':'waiting'}">${esc(a.status||'waiting')}</span><button class="primary" data-visit="${a.id}">Open</button></div></div>`).join(""):"<div class='panel'>No patients booked for you today.</div>";
  document.querySelectorAll("[data-visit]").forEach(b=>b.onclick=()=>openVisit(b.dataset.visit));
}
async function openVisit(id){
  const {data:a,error:ae}=await sb.from("appointments").select("*").eq("id",id).single();if(ae)throw ae;selectedVisit=a;const {data:p,error:pe}=await sb.from("patients").select("*").eq("id",a.patient_id).single();if(pe)throw pe;
  $("doctorPatientInfo").innerHTML=`<h3>${esc(p.name)}</h3><p>${esc(p.age)} years · ${esc(p.gender)} · ${esc(p.mobile||"-")} · BP ${esc(p.blood_pressure||"-")}</p><p>${esc(p.address||"-")}</p>`;
  const {data:notes,error:ne}=await sb.from("visits").select("*").eq("appointment_id",id).order("created_at",{ascending:false});if(ne)throw ne;
  $("previousNotes").innerHTML=notes?.length?"<h4>Previous notes</h4>"+notes.map(n=>`<div class='note'><b>${fmtDate(n.created_at)}</b><br>${esc(n.notes||"")}</div>`).join(""):"<p class='hint'>No notes recorded for this visit.</p>";
  $("doctorNotes").value=a.notes||"";showModal("doctorModal");
}
$("saveNotesBtn").onclick=async()=>{try{if(!selectedVisit)return;const notes=$("doctorNotes").value.trim();const {error}=await sb.from("appointments").update({notes}).eq("id",selectedVisit.id);if(error)throw error;const {data:existing}=await sb.from("visits").select("id").eq("appointment_id",selectedVisit.id).limit(1);if(existing?.length){await sb.from("visits").update({notes}).eq("id",existing[0].id)}else{await sb.from("visits").insert({appointment_id:selectedVisit.id,patient_id:selectedVisit.patient_id,doctor_id:currentUser.id,notes})}toast("Notes saved.");await openVisit(selectedVisit.id)}catch(e){alert(friendlyError(e))}};
$("seenBtn").onclick=async()=>{try{const {error}=await sb.from("appointments").update({status:"seen",seen_at:new Date().toISOString(),seen_by:currentUser.id,notes:$("doctorNotes").value.trim()}).eq("id",selectedVisit.id);if(error)throw error;toast("Patient marked as seen.");hideModal("doctorModal");await loadDoctorPatients();await loadAppointments()}catch(e){alert(friendlyError(e))}};
$("refundBtn").onclick=()=>{if(!selectedVisit)return;$("refundPatientInfo").innerHTML=`<b>Patient:</b> ${esc(selectedVisit.patient_name)}<br><b>Appointment:</b> ${esc(selectedVisit.time)}<br><b>Refund method:</b> Cash`;$("rOriginal").value=Number(selectedVisit.fee||0).toFixed(2);$("rAmount").value="";showModal("refundModal")};
$("refundForm").onsubmit=async e=>{e.preventDefault();try{const amount=Number($("rAmount").value),original=Number(selectedVisit.fee||0);if(amount<=0||amount>original)throw new Error("Refund must be greater than 0 and not exceed the original fee.");const {error}=await sb.from("refunds").insert({appointment_id:selectedVisit.id,patient_id:selectedVisit.patient_id,patient_name:selectedVisit.patient_name,original_fee:original,refund_amount:amount,method:"Cash",status:"pending",requested_by:currentUser.id,doctor_name:currentProfile.name});if(error)throw error;hideModal("refundModal");toast("Cash refund sent to Reception.");await loadRefunds()}catch(e){alert(friendlyError(e))}};

async function loadRefunds(){const {data,error}=await sb.from("refunds").select("*").eq("status","pending").order("requested_at",{ascending:false});if(error)throw error;$("refundList").innerHTML=data?.length?data.map(r=>`<div class="item"><div><h3>${esc(r.patient_name)}</h3><p>Original fee: ₹${Number(r.original_fee).toFixed(2)} · Refund: <b>₹${Number(r.refund_amount).toFixed(2)}</b> · Cash</p><p>Requested by: ${esc(r.doctor_name||"-")} · ${fmtDate(r.requested_at)}</p></div><button class="primary" data-complete-refund="${r.id}">Cash Given — Complete</button></div>`).join(""):"<div class='panel'>No pending refunds.</div>";$("statRefunds").textContent=data?.length||0;document.querySelectorAll("[data-complete-refund]").forEach(b=>b.onclick=()=>completeRefund(b.dataset.completeRefund))}
async function completeRefund(id){const {error}=await sb.from("refunds").update({status:"completed",completed_by:currentUser.id,completed_at:new Date().toISOString()}).eq("id",id);if(error)throw error;toast("Refund marked completed.");await loadRefunds()}

async function viewPatient(id){const {data:p,error}=await sb.from("patients").select("*").eq("id",id).single();if(error){alert(friendlyError(error));return}$("patientDetails").innerHTML=`<div class='patient-summary'><p><b>Name:</b> ${esc(p.name)}</p><p><b>Age:</b> ${esc(p.age)}</p><p><b>Gender:</b> ${esc(p.gender)}</p><p><b>Mobile:</b> ${esc(p.mobile||"-")}</p><p><b>Address:</b> ${esc(p.address||"-")}</p><p><b>Blood pressure:</b> ${esc(p.blood_pressure||"-")}</p></div>`;showModal("patientViewModal")}

$("email").focus();

(async()=>{
  try{
    requireConfig();
    const {data:{session}}=await sb.auth.getSession();
    if(session?.user && !session.user.is_anonymous){
      currentUser=session.user;currentProfile=await getProfile(currentUser.id);$("appView").classList.remove("hidden");$("roleLabel").textContent=currentProfile.role.toUpperCase();$("userEmail").textContent=currentUser.email||"";applyRoleUI();await openPage(currentProfile.role==="doctor"?"doctor":"admin");
    }else{
      if(session?.user && session.user.is_anonymous) currentUser=session.user; else currentUser=await ensureReception();
      currentProfile={role:"receptionist",name:"Reception"};showReception();
    }
  }catch(e){console.error(e);alert(friendlyError(e))}
})();
