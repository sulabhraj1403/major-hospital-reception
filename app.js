import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc,
  query, where, orderBy, limit, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let selectedVisit = null;
let patientsCache = [];
let doctorsCache = [];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmtDate = v => {
  if (!v) return "";
  const d = v.toDate ? v.toDate() : new Date(v);
  return d.toLocaleString("en-IN", {dateStyle:"medium", timeStyle:"short"});
};
const toast = msg => {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  setTimeout(() => $("toast").style.display="none", 2500);
};
const showModal = id => $(id).classList.remove("hidden");
const hideModal = id => $(id).classList.add("hidden");

document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => hideModal(b.dataset.close)));

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    $("loginError").textContent = err.code === "auth/invalid-credential"
      ? "Invalid email or password."
      : err.message;
  }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));

document.querySelectorAll(".nav").forEach(btn => btn.addEventListener("click", () => openPage(btn.dataset.page)));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new Error("No user profile found. Create users/" + uid + " in Firestore with a role.");
  return {id:snap.id, ...snap.data()};
}

function applyRoleUI() {
  const role = currentProfile.role;
  $("roleLabel").textContent = role ? role.toUpperCase() : "";
  document.querySelectorAll(".doctor-only").forEach(x => x.classList.toggle("hidden", role !== "doctor"));
  document.querySelectorAll(".reception-only").forEach(x => x.classList.toggle("hidden", role !== "receptionist" && role !== "admin"));
  document.querySelectorAll(".admin-only").forEach(x => x.classList.toggle("hidden", role !== "admin"));
}

async function openPage(page) {
  document.querySelectorAll(".page").forEach(x => x.classList.add("hidden"));
  $(page).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.page === page));
  if (page === "dashboard") await loadDashboard();
  if (page === "patients") await loadPatients();
  if (page === "appointments") await loadAppointments();
  if (page === "doctor") await loadDoctorPatients();
  if (page === "reception") await loadRefunds();
}

async function loadDashboard() {
  $("todayText").textContent = new Date().toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const qs = await getDocs(query(collection(db,"appointments"), where("dateKey","==",todayKey())));
  let waiting=0, seen=0;
  qs.forEach(s => s.data().status === "seen" ? seen++ : waiting++);
  $("statBookings").textContent = qs.size;
  $("statWaiting").textContent = waiting;
  $("statSeen").textContent = seen;
  const rq = await getDocs(query(collection(db,"refunds"), where("status","==","pending")));
  $("statRefunds").textContent = rq.size;
}

async function loadPatients() {
  const snap = await getDocs(query(collection(db,"patients"), orderBy("createdAt","desc"), limit(200)));
  patientsCache = snap.docs.map(d => ({id:d.id,...d.data()}));
  renderPatients(patientsCache);
}
function renderPatients(arr) {
  $("patientList").innerHTML = arr.length ? arr.map(p => `
    <div class="item">
      <div><h3>${esc(p.name)}</h3><p>${esc(p.age)} years · ${esc(p.gender)} · ${esc(p.mobile||"No mobile")}</p></div>
      <div class="item-actions"><span class="badge">${esc(p.patientCode||p.id)}</span><button class="outline" data-view-patient="${p.id}">View</button></div>
    </div>`).join("") : `<div class="panel">No patients found.</div>`;
  document.querySelectorAll("[data-view-patient]").forEach(b => b.addEventListener("click",()=>viewPatient(b.dataset.viewPatient)));
}
$("patientSearch").addEventListener("input", e => {
  const q=e.target.value.toLowerCase();
  renderPatients(patientsCache.filter(p => `${p.name} ${p.mobile||""}`.toLowerCase().includes(q)));
});
$("newPatientBtn").addEventListener("click",()=>{ $("patientForm").reset(); $("patientId").value=""; $("patientModalTitle").textContent="New Patient"; showModal("patientModal"); });

$("patientForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const data = {
    name:$("pName").value.trim(), age:Number($("pAge").value), gender:$("pGender").value,
    mobile:$("pMobile").value.trim(), address:$("pAddress").value.trim(), bloodPressure:$("pBP").value.trim(),
    updatedAt:serverTimestamp()
  };
  const id=$("patientId").value;
  if(id) await updateDoc(doc(db,"patients",id),data);
  else {
    data.createdAt=serverTimestamp();
    data.patientCode="MH-"+Date.now().toString().slice(-7);
    await addDoc(collection(db,"patients"),data);
  }
  hideModal("patientModal"); toast("Patient saved."); await loadPatients();
});

async function viewPatient(id) {
  const p = patientsCache.find(x=>x.id===id) || (await getDoc(doc(db,"patients",id))).data();
  $("patientDetails").innerHTML = `
    <div class="patient-info"><h3>${esc(p.name)}</h3>
    <p><b>ID:</b> ${esc(p.patientCode||id)} &nbsp; <b>Age:</b> ${esc(p.age)} &nbsp; <b>Gender:</b> ${esc(p.gender)}</p>
    <p><b>Mobile:</b> ${esc(p.mobile||"-")} &nbsp; <b>BP:</b> ${esc(p.bloodPressure||"-")}</p>
    <p><b>Address:</b> ${esc(p.address||"-")}</p></div>`;
  showModal("patientViewModal");
}

async function loadAppointments() {
  const snap=await getDocs(query(collection(db,"appointments"),where("dateKey","==",todayKey())));
  const arr=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  $("appointmentList").innerHTML=arr.length?arr.map(a=>`
    <div class="item"><div><h3>${esc(a.patientName)}</h3><p>${esc(a.time)} · ${esc(a.doctorName)} · ₹${Number(a.fee||0).toFixed(2)}</p></div><span class="badge ${a.status==="seen"?"seen":"waiting"}">${esc(a.status||"waiting")}</span></div>`).join(""):`<div class="panel">No bookings for today.</div>`;
}
$("newBookingBtn").addEventListener("click", async ()=>{
  await loadPatients();
  await loadDoctors();
  $("bPatient").innerHTML=patientsCache.map(p=>`<option value="${p.id}">${esc(p.name)} — ${esc(p.mobile||p.patientCode||"")}</option>`).join("");
  $("bDoctor").innerHTML=doctorsCache.map(d=>`<option value="${d.id}">${esc(d.name||d.email||d.id)}</option>`).join("");
  $("bPayment").value="Cash"; $("upiTimeWrap").classList.add("hidden"); $("bUpiTime").required=false;
  showModal("bookingModal");
});
$("bPayment").addEventListener("change",()=>{
  const upi=$("bPayment").value==="UPI"; $("upiTimeWrap").classList.toggle("hidden",!upi); $("bUpiTime").required=upi;
});
async function loadDoctors() {
  const snap=await getDocs(query(collection(db,"users"),where("role","==","doctor")));
  doctorsCache=snap.docs.map(d=>({id:d.id,...d.data()}));
}
$("bookingForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const p=patientsCache.find(x=>x.id===$("bPatient").value);
  const d=doctorsCache.find(x=>x.id===$("bDoctor").value);
  const data={
    patientId:p.id,patientName:p.name,doctorId:d.id,doctorName:d.name||d.email||d.id,
    dateKey:todayKey(),time:$("bTime").value,fee:Number($("bFee").value),
    paymentMethod:$("bPayment").value,upiPaymentTime:$("bPayment").value==="UPI"?$("bUpiTime").value:null,
    status:"waiting",createdAt:serverTimestamp(),createdBy:currentUser.uid
  };
  await addDoc(collection(db,"appointments"),data);
  hideModal("bookingModal");toast("Booking created.");await loadAppointments();await loadDashboard();
});

async function loadDoctorPatients() {
  const snap=await getDocs(query(collection(db,"appointments"),where("dateKey","==",todayKey()),where("doctorId","==",currentUser.uid)));
  const arr=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  $("doctorList").innerHTML=arr.length?arr.map(a=>`
    <div class="item"><div><h3>${esc(a.patientName)}</h3><p>${esc(a.time)} · Fee ₹${Number(a.fee||0).toFixed(2)} · ${esc(a.paymentMethod)}</p></div>
    <div class="item-actions"><span class="badge ${a.status==="seen"?"seen":"waiting"}">${esc(a.status||"waiting")}</span><button class="primary" data-visit="${a.id}">Open</button></div></div>`).join(""):`<div class="panel">No patients booked for you today.</div>`;
  document.querySelectorAll("[data-visit]").forEach(b=>b.addEventListener("click",()=>openVisit(b.dataset.visit)));
}
async function openVisit(id) {
  const snap=await getDoc(doc(db,"appointments",id)); if(!snap.exists()) return;
  selectedVisit={id,...snap.data()};
  const p=await getDoc(doc(db,"patients",selectedVisit.patientId)); const patient=p.data();
  $("doctorPatientInfo").innerHTML=`<h3>${esc(patient.name)}</h3><p>${esc(patient.age)} years · ${esc(patient.gender)} · ${esc(patient.mobile||"-")} · BP ${esc(patient.bloodPressure||"-")}</p><p>${esc(patient.address||"-")}</p>`;
  const notes=await getDocs(query(collection(db,"visits"),where("appointmentId","==",id),orderBy("createdAt","desc")));
  $("previousNotes").innerHTML=notes.docs.length?`<h4>Previous notes</h4>`+notes.docs.map(n=>`<div class="note"><b>${fmtDate(n.data().createdAt)}</b><br>${esc(n.data().notes||"")}</div>`).join(""):"<p class='hint'>No notes recorded for this visit.</p>";
  $("doctorNotes").value=selectedVisit.notes||"";
  showModal("doctorModal");
}
$("saveNotesBtn").addEventListener("click",async()=>{
  if(!selectedVisit)return;
  await updateDoc(doc(db,"appointments",selectedVisit.id),{notes:$("doctorNotes").value.trim(),updatedAt:serverTimestamp()});
  const existing=await getDocs(query(collection(db,"visits"),where("appointmentId","==",selectedVisit.id),limit(1)));
  if(existing.empty) await addDoc(collection(db,"visits"),{appointmentId:selectedVisit.id,patientId:selectedVisit.patientId,doctorId:currentUser.uid,notes:$("doctorNotes").value.trim(),createdAt:serverTimestamp()});
  else await updateDoc(existing.docs[0].ref,{notes:$("doctorNotes").value.trim(),updatedAt:serverTimestamp()});
  toast("Notes saved."); await openVisit(selectedVisit.id);
});
$("seenBtn").addEventListener("click",async()=>{
  await updateDoc(doc(db,"appointments",selectedVisit.id),{status:"seen",seenAt:serverTimestamp(),seenBy:currentUser.uid,notes:$("doctorNotes").value.trim()});
  toast("Patient marked as seen."); hideModal("doctorModal"); await loadDoctorPatients(); await loadDashboard();
});
$("refundBtn").addEventListener("click",()=>{
  $("refundPatientInfo").innerHTML=`<b>Patient:</b> ${esc(selectedVisit.patientName)}<br><b>Appointment:</b> ${esc(selectedVisit.time)}<br><b>Refund method:</b> Cash`;
  $("rOriginal").value=Number(selectedVisit.fee||0).toFixed(2); $("rAmount").value="";
  showModal("refundModal");
});
$("refundForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const amount=Number($("rAmount").value), original=Number(selectedVisit.fee||0);
  if(amount<=0 || amount>original){alert("Refund must be greater than 0 and not exceed the original fee.");return;}
  await addDoc(collection(db,"refunds"),{
    appointmentId:selectedVisit.id,patientId:selectedVisit.patientId,patientName:selectedVisit.patientName,
    originalFee:original,refundAmount:amount,method:"Cash",status:"pending",
    requestedBy:currentUser.uid,doctorName:currentProfile.name||currentUser.email,requestedAt:serverTimestamp()
  });
  hideModal("refundModal");toast("Cash refund sent to Reception.");await loadDashboard();
});

async function loadRefunds() {
  const snap=await getDocs(query(collection(db,"refunds"),where("status","==","pending")));
  $("refundList").innerHTML=snap.docs.length?snap.docs.map(d=>{const r=d.data();return`
    <div class="item"><div><h3>${esc(r.patientName)}</h3><p>Original fee: ₹${Number(r.originalFee).toFixed(2)} · Refund: <b>₹${Number(r.refundAmount).toFixed(2)}</b> · Cash</p><p>Requested by: ${esc(r.doctorName||"-")} · ${fmtDate(r.requestedAt)}</p></div>
    <button class="primary" data-complete-refund="${d.id}">Cash Given — Complete</button></div>`}).join(""):`<div class="panel">No pending refunds.</div>`;
  document.querySelectorAll("[data-complete-refund]").forEach(b=>b.addEventListener("click",()=>completeRefund(b.dataset.completeRefund)));
}
async function completeRefund(id){
  await updateDoc(doc(db,"refunds",id),{status:"completed",completedBy:currentUser.uid,completedAt:serverTimestamp()});
  toast("Refund marked completed.");await loadRefunds();await loadDashboard();
}

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

onAuthStateChanged(auth,async user=>{
  if(!user){
    currentUser=null;currentProfile=null;$("loginView").classList.remove("hidden");$("appView").classList.add("hidden");return;
  }
  try{
    currentUser=user;
    currentProfile=await getProfile(user.uid);
    $("userEmail").textContent=user.email;
    applyRoleUI();
    $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
    await openPage("dashboard");
  }catch(err){
    await signOut(auth);
    $("loginError").textContent=err.message;
  }
});
