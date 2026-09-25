import { initializeApp } from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword
} from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const loginButton = document.getElementById("loginBtn");

loginButton.addEventListener("click", async () => {

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const message = document.getElementById("message");

    if (!email || !password) {
        message.textContent = "Please enter email and password.";
        return;
    }

    try {

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        message.textContent = "Login successful.";

        // Dashboard will be added next.

    } catch (error) {

        message.textContent = "Login failed: " + error.message;

    }

});