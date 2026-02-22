import numpy as np
import pickle
from pathlib import Path
from tensorflow.keras.models import load_model

_dir = Path(__file__).resolve().parent

# Load model and preprocessing objects
model = load_model(str(_dir / "my_model.h5"))
scaler = pickle.load(open(_dir / "scaler.pkl", "rb"))
le = pickle.load(open(_dir / "label_encoder.pkl", "rb"))

def predict_disease(patient_dict):
    """
    patient_dict: dictionary of symptom features (0/1)
    returns: predicted disease as string
    """
    # Convert dictionary to array (ensure order matches training data)
    x = np.array([list(patient_dict.values())])
    
    # Scale features
    x_scaled = scaler.transform(x)
    
    # Predict class index
    pred_probs = model.predict(x_scaled)
    pred_class = pred_probs.argmax(axis=1)
    
    # Convert class index to disease label
    disease = le.inverse_transform(pred_class)[0]
    
    return disease

