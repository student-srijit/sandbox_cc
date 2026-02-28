# Bhool Bhulaiyaa 🌪️
## Generative AI Web3 Security Honeypot (Backend)

This repository contains the backend service for **Bhool Bhulaiyaa** — a Polymorphic Web3 Deception Engine.

While the Next.js frontend handles client-side telemetry (Mouse entropy, Canvas fingerprinting, WebGL hashes) to accurately identify bot traffic, this **Python FastAPI** service takes over once a bot is detected.

Instead of blocking the attacker, we route them into a stateful, AI-driven hallucination of an Ethereum node powered by local **LLaMA 3**. We waste their compute, log their payloads, and extract Threat Intelligence.

---

### System Architecture

*   **`main.py` / `router.py`**: Intercepts requests, reads the `X-BB-Threat-Score` assigned by the frontend, and routes traffic.
*   **`classifier.py`**: OSINT engine that infers the attacker's intent (e.g. Wallet Drainer, Reentrancy Probe) and tooling.
*   **`world_state.py`**: A session manager that maintains a fake, persistent Ethereum blockchain state per-attacker. As they probe deeper, we escalate their tier and expose "Jackpot" bait wallets.
*   **`llm.py`**: Integrates with local Ollama. We use strict prompting to force LLaMA to act exactly like an Omnibus Geth node speaking only valid `JSON-RPC 2.0`.
*   **`intelligence.py` / `database.py`**: Compiles their activity into a dossier and saves it to a local SQLite database for the React War Room dashboard.

---

### Setup Instructions for Judges

This backend is designed to run locally alongside the Next.js frontend during the demo. 

#### 1. Requirements

*   Python 3.11+
*   Node.js 20+ (for the frontend in the parent directory)
*   [Ollama](https://ollama.ai/) installed locally.

#### 2. Install & Start Ollama (The AI Engine)

We use LLaMA 3 to dynamically generate the fake JSON-RPC responses.

```bash
# 1. Install Ollama (if you haven't already for Mac/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start the Ollama background service 
ollama serve &

# 3. Pull the LLaMA 3 model (Requires ~4.7GB of disk space)
ollama pull llama3
```

*(Note: If Ollama crashes or is unavailable, the backend is built to gracefully degrade to `STATIC_RPC_LIBRARY` fallbacks seamlessly so the demo won't break).*

#### 3. Start the Backend Honeypot

Open a new terminal window in this `backend` directory.

```bash
# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install FastAPI and dependencies
pip install -r requirements.txt

# 3. Start the server on port 8000
uvicorn backend.main:app --reload --port 8000
```

#### 4. Start the Frontend

Open another terminal in the parent directory (`bhool-bhulaiyaa`).

```bash
npm install
npm run dev
```

Visit the dashboard at `http://localhost:3000/dashboard` and run the simulation scripts to see the full architecture light up!
