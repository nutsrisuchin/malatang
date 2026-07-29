// Firebase project config — NOT secret, safe to commit.
// Fill these in from: Firebase console → Project settings → General → "Your apps" → SDK setup.
// See APP_OVERVIEW.md §9 for full setup steps.
const firebaseConfig = {
  apiKey: "AIzaSyCCclfaf8kpex80Wk4BKd8AAoziiNDl-As",
  authDomain: "malatang-df89b.firebaseapp.com",
  projectId: "malatang-df89b",
  storageBucket: "malatang-df89b.firebasestorage.app",
  messagingSenderId: "979431167013",
  appId: "1:979431167013:web:6bcf8f1bf0985fc98a1bcc"
};

// Synthetic email domain used to turn "name + PIN" logins into real
// Firebase Authentication accounts (name -> slug@AUTH_DOMAIN).
const AUTH_DOMAIN = "malatang.local";

// Fixed bootstrap App Owner account. Create this user manually once in
// Firebase Authentication (Add user) with this exact email and a chosen
// PIN as the password. This account is trusted unconditionally so the
// restaurant can never be locked out of its own system.
const OWNER_EMAIL = "owner@malatang.local";
