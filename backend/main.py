from fastapi import FastAPI

app = FastAPI(title="Hack Axxess 2026 API")


@app.get("/")
def root():
    return {"message": "Hello from Hack Axxess 2026 API"}


@app.get("/health")
def health():
    return {"status": "ok"}
