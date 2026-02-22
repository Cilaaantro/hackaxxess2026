// frontend/src/Login.jsx
import { auth, db } from "./firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Login({ setUser }) {
  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      setUser(user);

      // Firestore: save user if not exists
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          lastLogin: new Date().toISOString(),
        });
      } else {
        await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
      }

      console.log("User saved in Firestore!");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          Health <em>Bridge</em>
        </div>
        <p className="login-tagline">Your health, understood</p>
        <p>Sign in to manage your health data and get personalised insights.</p>
        <button type="button" onClick={login}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}