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
  try{const {data,error}=await sb.from("patients").select("id,name,mobile").order("name").limit(500);if(error)throw error;patientsCache=data||[];
    $("bPatient").innerHTML=patientsCache.map(p=>`<option value="${p.id}">${esc(p.name)} — ${esc(p.mobile||"")}</option>`).join("");
    if(patientId)$("bPatient").value=patientId;
    $("bTime").value=new Date().toTimeString().slice(0,5);$("bPayment").value="Cash";showModal("bookingModal");
  }catch(err){alert(friendlyError(err))}
}
$("bookingForm").addEventListener("submit",async e=>{
  e.preventDefault();try{const p=patientsCache.find(x=>x.id===$("bPatient").value);if(!p)throw new Error("Select a patient.");const row={patient_id:p.id,patient_name:p.name,date_key:todayKey(),time:$("bTime").value,fee:Number($("bFee").value),payment_method:$("bPayment").value,status:"waiting",created_by:currentUser.id};const {error}=await sb.from("appointments").insert(row);if(error)throw error;hideModal("bookingModal");toast("Booking created.");await loadAppointments();await loadRefunds();}catch(err){console.error(err);alert(friendlyError(err))}
});

async function loadAppointments(){
  const {data,error}=await sb.from("appointments").select("*").is("deleted_at",null).order("date_key",{ascending:false}).order("time",{ascending:true}).limit(500);
  if(error)throw error;
  const arr=data||[];const today=arr.filter(a=>a.date_key===todayKey());
  const render=(a,showDate=false)=>`<div class="item"><div><h3>${esc(a.patient_name)}</h3><p>${showDate?esc(a.date_key)+" · ":""}${esc(a.time)} · ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.payment_method)}</p></div><div class="item-actions"><span class="badge ${a.status==='seen'?'seen':'waiting'}">${esc(a.status||'waiting')}</span><button class="outline" data-delete-booking="${a.id}">Delete</button></div></div>`;
  $("receptionBookings").innerHTML=today.length?today.map(a=>render(a)).join(""):"<div class='panel'>No bookings today.</div>";
  $("appointmentList").innerHTML=arr.length?arr.map(a=>render(a,true)).join(""):"<div class='panel'>No bookings found.</div>";
  $("statBookings").textContent=today.length;$("statWaiting").textContent=today.filter(a=>a.status==='waiting').length;$("statSeen").textContent=today.filter(a=>a.status==='seen').length;
  bindDeleteBookingButtons();
}

async function loadDoctorPatients(){
  $("doctorList").innerHTML="<div class='panel'>Loading today's patients…</div>";
  const {data,error}=await sb.from("appointments").select("*").eq("date_key",todayKey()).is("deleted_at",null).order("time",{ascending:true});if(error){$("doctorList").innerHTML=`<div class='panel error'>${esc(friendlyError(error))}</div>`;return}
  $("doctorList").innerHTML=data?.length?data.map(a=>`<div class="item"><div><h3>${esc(a.patient_name)}</h3><p>${esc(a.time)} · Fee ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.payment_method)}</p></div><div class="item-actions"><span class="badge ${a.status==='seen'?'seen':'waiting'}">${esc(a.status||'waiting')}</span><button class="primary" data-visit="${a.id}">Open</button><button class="outline" data-delete-booking="${a.id}">Delete</button></div></div>`).join(""):"<div class='panel'>No patients booked for you today.</div>";
  document.querySelectorAll("[data-visit]").forEach(b=>b.onclick=()=>openVisit(b.dataset.visit));
  bindDeleteBookingButtons();
}

function bindDeleteBookingButtons(){
  document.querySelectorAll("[data-delete-booking]").forEach(b=>b.onclick=()=>deleteBooking(b.dataset.deleteBooking));
}

async function deleteBooking(id){
  if(!id)return;
  if(!confirm("Delete this booking? The patient record and booking history will remain in the Patients tab."))return;
  try{
    const {data,error}=await sb.rpc("soft_delete_booking",{p_appointment_id:id});
    if(error)throw error;
    const deleted=Array.isArray(data)?data[0]:data;
    if(!deleted || deleted.deleted_at==null)throw new Error("The booking was not marked as deleted.");
    toast("Booking deleted. Patient data remains saved.");
    await loadAppointments();
    await loadDoctorPatients();
  }catch(e){console.error("deleteBooking failed:",e);alert(friendlyError(e));}
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
async function openRefundForm(){
  if(!selectedVisit)return;
  const original=Number(selectedVisit.fee||0);
  const {data,error}=await sb.from("refunds").select("refund_amount,status").eq("appointment_id",selectedVisit.id);
  if(error){alert(friendlyError(error));return}
  const refunded=(data||[]).reduce((sum,r)=>sum+Number(r.refund_amount||0),0);
  const remaining=Math.max(0,original-refunded);
  $("refundPatientInfo").innerHTML=`<b>Patient:</b> ${esc(selectedVisit.patient_name)}<br><b>Original fees:</b> ₹${original.toFixed(2)}<br><b>Already requested/refunded:</b> ₹${refunded.toFixed(2)}<br><b>Remaining refundable:</b> ₹${remaining.toFixed(2)}<br><b>Refund method:</b> Cash`;
  $("rOriginal").value=original.toFixed(2);
  $("rAmount").value="";
  $("rAmount").max=remaining.toFixed(2);
  $("rAmount").disabled=remaining<=0;
  $("refundSubmitBtn").disabled=remaining<=0;
  showModal("refundModal");
}
$("refundBtn").onclick=openRefundForm;
$("refundForm").onsubmit=async e=>{e.preventDefault();try{const amount=Number($("rAmount").value),original=Number(selectedVisit.fee||0);const {data:existing,error:re}=await sb.from("refunds").select("refund_amount").eq("appointment_id",selectedVisit.id);if(re)throw re;const refunded=(existing||[]).reduce((sum,r)=>sum+Number(r.refund_amount||0),0);const remaining=Math.max(0,original-refunded);if(amount<=0||amount>remaining)throw new Error(`Refund must be greater than 0 and not exceed the remaining refundable amount of ₹${remaining.toFixed(2)}.`);const {error}=await sb.from("refunds").insert({appointment_id:selectedVisit.id,patient_id:selectedVisit.patient_id,patient_name:selectedVisit.patient_name,original_fee:original,refund_amount:amount,method:"Cash",status:"pending",requested_by:currentUser.id,doctor_name:currentProfile.name});if(error)throw error;hideModal("refundModal");toast("Refund notice sent to Reception for cash clearance.");await loadRefunds()}catch(e){alert(friendlyError(e))}};

async function loadRefunds(){const {data,error}=await sb.from("refunds").select("*").eq("status","pending").order("requested_at",{ascending:false});if(error)throw error;$("refundList").innerHTML=data?.length?data.map(r=>`<div class="item"><div><h3>${esc(r.patient_name)}</h3><p>Original fee: ₹${Number(r.original_fee).toFixed(2)} · Refund: <b>₹${Number(r.refund_amount).toFixed(2)}</b> · Cash</p><p>Requested by: ${esc(r.doctor_name||"-")} · ${fmtDate(r.requested_at)}</p></div><button class="primary" data-complete-refund="${r.id}">Cash Given — Complete</button></div>`).join(""):"<div class='panel'>No pending refunds.</div>";$("statRefunds").textContent=data?.length||0;document.querySelectorAll("[data-complete-refund]").forEach(b=>b.onclick=()=>completeRefund(b.dataset.completeRefund))}
async function completeRefund(id){
  const button=document.querySelector(`[data-complete-refund="${id}"]`);
  if(button){button.disabled=true;button.textContent="Completing…"}
  try{
    if(!id)throw new Error("Refund ID is missing.");
    if(!isAnon() && currentProfile?.role!=="admin")throw new Error("Cash refunds can only be completed from the Reception account.");
    const {data,error}=await sb.rpc("complete_cash_refund",{p_refund_id:id});
    if(error)throw error;
    const completed=Array.isArray(data)?data[0]:data;
    if(!completed || completed.status!=="completed")throw new Error("Supabase did not confirm the cash refund as completed.");
    await loadRefunds();
    toast("Cash refund completed and removed from pending refunds.");
  }catch(e){
    if(button){button.disabled=false;button.textContent="Cash Given — Complete"}
    console.error("completeRefund failed:",e);
    alert(friendlyError(e));
  }
}

async function viewPatient(id){
  const {data:p,error}=await sb.from("patients").select("*").eq("id",id).single();if(error){alert(friendlyError(error));return}
  const {data:history,error:he}=await sb.from("appointments").select("id,date_key,time,fee,payment_method,status,notes,deleted_at").eq("patient_id",id).order("date_key",{ascending:false}).order("time",{ascending:false}).limit(100);
  if(he){alert(friendlyError(he));return}
  const historyHtml=history?.length?`<h4 style="margin-top:18px">Booking history</h4><div class="history">${history.map(a=>`<div class="note"><b>${esc(a.date_key)} · ${esc(a.time)}</b><br>Fee: ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.payment_method)} · ${esc(a.status||"-")}${a.deleted_at?" · Deleted":""}${a.notes?`<br>Notes: ${esc(a.notes)}`:""}</div>`).join("")}</div>`:"<p class='hint'>No booking history recorded.</p>`;
  $("patientDetails").innerHTML=`<div class='patient-summary'><p><b>Name:</b> ${esc(p.name)}</p><p><b>Age:</b> ${esc(p.age)}</p><p><b>Gender:</b> ${esc(p.gender)}</p><p><b>Mobile:</b> ${esc(p.mobile||"-")}</p><p><b>Address:</b> ${esc(p.address||"-")}</p><p><b>Blood pressure:</b> ${esc(p.blood_pressure||"-")}</p>${historyHtml}</div>`;
  showModal("patientViewModal")
}

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
