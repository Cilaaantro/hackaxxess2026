import pdfplumber
import re
import json
import sys
from pathlib import Path

def extract_bloodwork(pdf_path, output_json_path=None):
    """
    Extract bloodwork data from PDF and return as JSON/dict.
    
    Args:
        pdf_path: Path to PDF file
        output_json_path: Optional path to save JSON file
        
    
    Returns:
        Dictionary with extracted biomarkers
    """
    
    # Extract text from PDF
    with pdfplumber.open(pdf_path) as pdf:
        text = " ".join([page.extract_text() or "" for page in pdf.pages])
    
    text_lower = text.lower()
    
    # Define biomarkers and their regex patterns
    patterns = {
        'total_cholesterol': r'total\s+cholesterol[:\s]+(\d+\.?\d*)',
        'ldl': r'ldl[:\s]+(\d+\.?\d*)|low\s+density[:\s]+(\d+\.?\d*)',
        'hdl': r'hdl[:\s]+(\d+\.?\d*)|high\s+density[:\s]+(\d+\.?\d*)',
        'triglycerides': r'triglycerides?[:\s]+(\d+\.?\d*)',
        'glucose': r'glucose[:\s]+(\d+\.?\d*)',
        'hba1c': r'hb?a1c[:\s]+(\d+\.?\d*)',
        'hemoglobin': r'hemoglobin[:\s]+(\d+\.?\d*)',
        'hematocrit': r'hematocrit[:\s]+(\d+\.?\d*)',
        'wbc': r'wbc[:\s]+(\d+\.?\d*)|white\s+blood[:\s]+(\d+\.?\d*)',
        'platelets': r'platelets?[:\s]+(\d+\.?\d*)',
        'vitamin_d': r'vitamin\s+d[:\s]+(\d+\.?\d*)',
        'vitamin_b12': r'vitamin\s+b12[:\s]+(\d+\.?\d*)',
        'ferritin': r'ferritin[:\s]+(\d+\.?\d*)',
        'iron': r'iron[:\s]+(\d+\.?\d*)',
        'tsh': r'tsh[:\s]+(\d+\.?\d*)',
        'creatinine': r'creatinine[:\s]+(\d+\.?\d*)',
        'bun': r'bun[:\s]+(\d+\.?\d*)',
        'alt': r'alt[:\s]+(\d+\.?\d*)',
        'ast': r'ast[:\s]+(\d+\.?\d*)',
    }
    
    # Extract values
    results = {}
    for name, pattern in patterns.items():
        match = re.search(pattern, text_lower)
        if match:
            # Get the first non-None group
            value = next((g for g in match.groups() if g is not None), None)
            if value:
                results[name] = float(value)
    
    # Build final structure
    output = {
        'filename': Path(pdf_path).name,
        'biomarkers': results
    }
    
    # Save to JSON if path provided
    if output_json_path:
        with open(output_json_path, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"Saved to: {output_json_path}")
    
    return output


# Command line usage
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_bloodwork.py <input.pdf> [output.json]")
        sys.exit(1)
    
    pdf_file = sys.argv[1]
    json_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    data = extract_bloodwork(pdf_file, json_file)
    print(json.dumps(data, indent=2))