// Firebase の初期化（設定はここだけで管理する）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCY8nqCkRFzf5-KheBDoy_0BbTybRm6U0U",
  authDomain: "card-kakeibo.firebaseapp.com",
  projectId: "card-kakeibo",
  storageBucket: "card-kakeibo.firebasestorage.app",
  messagingSenderId: "787928228488",
  appId: "1:787928228488:web:a7a3f488dd3da10d75353d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
