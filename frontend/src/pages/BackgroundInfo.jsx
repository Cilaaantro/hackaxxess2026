import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase"; // Adjust the path if needed
import { doc, setDoc, getDoc } from "firebase/firestore";

const BackgroundInfo = () => {
  // Setting initial states for diseases
  const [selfDiseases, setSelfDiseases] = useState({
    diabetes: false,
    hypertension: false,
    asthma: false,
    cancer: false,
    stroke: false,
  });

  const [familyDiseases, setFamilyDiseases] = useState({
    diabetes: false,
    hypertension: false,
    cancer: false,
    heartDisease: false,
    stroke: false,
  });

  // Check if the user is authenticated
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe(); // Cleanup the listener
  }, []);

  useEffect(() => {
    // Fetch data from Firestore if user is logged in
    if (user) {
      const fetchBackgroundInfo = async () => {
        const userDocRef = doc(db, "users", user.uid, "backgroundInfo", "data");
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setSelfDiseases(data.selfDiseases || {});
          setFamilyDiseases(data.familyDiseases || {});
        }
      };
      fetchBackgroundInfo();
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!user) {
      alert("No user is logged in!");
      return;
    }

    const dataToSave = {
      selfDiseases,
      familyDiseases,
      updatedAt: new Date().toISOString(),
    };

    try {
      // Save to Firestore under "users/{userId}/backgroundInfo/data"
      await setDoc(
        doc(db, "users", user.uid, "backgroundInfo", "data"),
        dataToSave
      );
      alert("Background info saved successfully!");
    } catch (err) {
      console.error("Error saving background info:", err);
      alert("Failed to save data. Check console for details.");
    }
  };

  // Helper function to toggle the checkbox values
  const handleCheckboxChange = (type, disease) => {
    if (type === "self") {
      setSelfDiseases({
        ...selfDiseases,
        [disease]: !selfDiseases[disease],
      });
    } else if (type === "family") {
      setFamilyDiseases({
        ...familyDiseases,
        [disease]: !familyDiseases[disease],
      });
    }
  };

  return (
    <div className="background-info">
      <h2>Background Info</h2>

      {user ? (
        <form onSubmit={handleSave}>
          <div>
            <h3>Your Health History (Self)</h3>
            {Object.keys(selfDiseases).map((disease) => (
              <label key={disease}>
                <input
                  type="checkbox"
                  checked={selfDiseases[disease]}
                  onChange={() => handleCheckboxChange("self", disease)}
                />
                {disease.charAt(0).toUpperCase() + disease.slice(1)}
              </label>
            ))}
          </div>

          <div>
            <h3>Family Health History</h3>
            {Object.keys(familyDiseases).map((disease) => (
              <label key={disease}>
                <input
                  type="checkbox"
                  checked={familyDiseases[disease]}
                  onChange={() => handleCheckboxChange("family", disease)}
                />
                {disease.charAt(0).toUpperCase() + disease.slice(1)}
              </label>
            ))}
          </div>

          <button type="submit">Save</button>
        </form>
      ) : (
        <p>Please log in to submit your background information.</p>
      )}
    </div>
  );
};

export default BackgroundInfo;