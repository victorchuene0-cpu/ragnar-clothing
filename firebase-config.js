// Firebase project config for Ragnar Clothing
const firebaseConfig = {
  apiKey: "AIzaSyBQgmmC8Uo5btq1o-VJregXFEcJBf4K98U",
  authDomain: "ragnar-clothing.firebaseapp.com",
  projectId: "ragnar-clothing",
  storageBucket: "ragnar-clothing.firebasestorage.app",
  messagingSenderId: "256832196991",
  appId: "1:256832196991:web:3a5cdc30744d3e1905ca4a"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
