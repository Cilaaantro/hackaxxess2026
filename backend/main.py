from fastapi import FastAPI

from routers import audio

app = FastAPI(title="Hack Axxess 2026 API")

app.include_router(audio.router)


@app.get("/")
def root():
    return {"message": "Hello from Hack Axxess 2026 API"}


@app.get("/health")
def health():
    return {"status": "ok"}
