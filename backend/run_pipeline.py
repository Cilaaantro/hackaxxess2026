"""
run_pipeline.py — Run the full bloodwork analysis pipeline
-----------------------------------------------------------
Usage:
    python run_pipeline.py <bloodwork.pdf> [options]

Options:
    --api-key       Featherless.ai API key (or set FEATHERLESS_API_KEY env var)
    --output-json   Save extracted biomarkers to this JSON file
    --output-report Save the LLM recommendations to this text file
    --model         Featherless model string (default: deepseek-ai/DeepSeek-R1-0528)
    --age           Patient age
    --sex           Patient sex (male/female/other)
    --weight-kg     Patient weight in kg
    --height-cm     Patient height in cm
    --activity      Activity level (sedentary/light/moderate/active/very_active)
    --goals         Health goals e.g. "lose weight, lower cholesterol"
    --diet          Dietary restrictions e.g. "vegetarian, no gluten"
"""

import argparse
import json
import os
import sys

from extract_bloodwork import extract_bloodwork
from bloodwork_advisor import analyze_bloodwork


def parse_args():
    parser = argparse.ArgumentParser(description="Bloodwork PDF → Personalized Meal & Exercise Plan")
    parser.add_argument("pdf", help="Path to bloodwork PDF")
    parser.add_argument("--api-key",       default=os.getenv("FEATHERLESS_API_KEY"))
    parser.add_argument("--output-json",   default=None)
    parser.add_argument("--output-report", default=None)
    parser.add_argument("--model",         default="deepseek-ai/DeepSeek-R1-0528")
    parser.add_argument("--age",           type=int,   default=None)
    parser.add_argument("--sex",           default=None)
    parser.add_argument("--weight-kg",     type=float, default=None)
    parser.add_argument("--height-cm",     type=float, default=None)
    parser.add_argument("--activity",      default=None,
                        choices=["sedentary","light","moderate","active","very_active"])
    parser.add_argument("--goals",         default=None)
    parser.add_argument("--diet",          default=None)
    return parser.parse_args()


def run():
    args = parse_args()

    if not args.api_key:
        print("ERROR: Featherless API key required. Pass --api-key or set FEATHERLESS_API_KEY.")
        sys.exit(1)

    # Step 1: Extract biomarkers from PDF
    print(f"\n📄 Extracting bloodwork from: {args.pdf}")
    bloodwork = extract_bloodwork(args.pdf, args.output_json)
    print(f"   Found {len(bloodwork['biomarkers'])} biomarkers: {list(bloodwork['biomarkers'].keys())}")

    if not bloodwork["biomarkers"]:
        print("⚠️  No biomarkers extracted. Check that your PDF contains recognizable lab values.")
        sys.exit(1)

    # Step 2: Build optional user profile
    user_profile = {k: v for k, v in {
        "age":                 args.age,
        "sex":                 args.sex,
        "weight_kg":           args.weight_kg,
        "height_cm":           args.height_cm,
        "activity_level":      args.activity,
        "goals":               args.goals,
        "dietary_restrictions":args.diet,
    }.items() if v is not None}

    # Step 3: Send to Featherless / DeepSeek
    print(f"\n🤖 Sending to Featherless.ai ({args.model})…")
    result = analyze_bloodwork(
        bloodwork_data=bloodwork,
        api_key=args.api_key,
        user_profile=user_profile or None,
        model=args.model,
    )

    # Step 4: Print results
    print("\n" + "═" * 70)
    print("FLAGGED BIOMARKERS")
    print("═" * 70)
    for marker, info in result["flagged_biomarkers"].items():
        icon = {"optimal": "✅", "borderline": "⚠️ ", "low": "🔴", "high": "🔴"}.get(info["status"], "❓")
        print(f"  {icon} {marker:<20} {info['value']} {info['unit']}  [{info['status'].upper()}]")

    print("\n" + "═" * 70)
    print("RECOMMENDATIONS")
    print("═" * 70)
    print(result["recommendations"])

    # Step 5: Save report if requested
    if args.output_report:
        with open(args.output_report, "w") as f:
            f.write("FLAGGED BIOMARKERS\n")
            f.write(json.dumps(result["flagged_biomarkers"], indent=2))
            f.write("\n\nRECOMMENDATIONS\n")
            f.write(result["recommendations"])
        print(f"\n💾 Report saved to: {args.output_report}")


run()