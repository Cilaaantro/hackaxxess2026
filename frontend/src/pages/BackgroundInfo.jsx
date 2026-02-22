import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { firestore, auth } from "../firebase"; // Make sure firebase is set up

export default function BackgroundInfo() {
  const [data, setData] = useState({
    diseases: {
      diabetes: { self: false, family: false },
      hypertension: { self: false, family: false },
      asthma: { self: false, family: false },
      cancer: { self: false, family: false },
      // Add more as needed
    },
    medications: "",
    otherInfo: ""
  });
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser?.uid; // assume user is signed in

  // Fetch user's background info
  useEffect(() => {
    if (!uid) return;
    const fetchData = async () => {
      const docRef = doc(firestore, "users", uid, "backgroundInfo", "info");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setData(docSnap.data());
      } else {
        // Create blank doc if none exists
        await setDoc(docRef, data);
      }
      setLoading(false);
    };
    fetchData();
  }, [uid]);

  const handleCheckbox = (disease, type) => {
    setData((prev) => ({
      ...prev,
      diseases: {
        ...prev.diseases,
        [disease]: {
          ...prev.diseases[disease],
          [type]: !prev.diseases[disease][type]
        }
      }
    }));
  };

  const handleChange = (e) => {
    setData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!uid) return;

    try {
      const docRef = doc(firestore, "users", uid, "backgroundInfo", "info");
      await setDoc(docRef, data, { merge: true }); // merge:true to update existing
      alert("Background info saved!");
    } catch (err) {
      console.error(err);
      alert("Error saving data.");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: 40 }}>
      <h2>Background Info</h2>
      <form onSubmit={handleSave}>
        <table>
          <thead>
            <tr>
              <th>Disease</th>
              <th>You</th>
              <th>Family</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(data.diseases).map((disease) => (
              <tr key={disease}>
                <td>{disease}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={data.diseases[disease].self}
                    onChange={() => handleCheckbox(disease, "self")}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={data.diseases[disease].family}
                    onChange={() => handleCheckbox(disease, "family")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <label>
          Medications:
          <input
            type="text"
            name="medications"
            value={data.medications}
            onChange={handleChange}
          />
        </label>

        <label>
          Other Info:
          <textarea
            name="otherInfo"
            value={data.otherInfo}
            onChange={handleChange}
          />
        </label>

        <button type="submit">Save</button>
      </form>
    </div>
  );
}