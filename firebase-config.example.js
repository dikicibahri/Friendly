// BU DOSYA ÖRNEKTİR. GERÇEK DOSYA DEĞİLDİR.
// Projeyi indiren kişi bu dosyanın adını 'firebase-config.js' yapıp kendi şifrelerini girmelidir.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
    apiKey: "BURAYA_KENDI_API_KEYINI_YAZ",
    authDomain: "SENIN_PROJEN.firebaseapp.com",
    databaseURL: "https://SENIN_PROJEN-default-rtdb.firebaseio.com",
    projectId: "SENIN_PROJEN",
    storageBucket: "SENIN_PROJEN.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

let app, auth, db, storage;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    storage = getStorage(app);
} catch (e) {
    console.error("Firebase Hatası:", e);
    alert("Bağlantı hatası: " + e.message);
}

export {
    app, auth, db, storage,
    signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut, signInWithRedirect,
    ref, set, get, update, push, onValue, remove, serverTimestamp, query, orderByChild,
    sRef, uploadBytes, getDownloadURL
};
