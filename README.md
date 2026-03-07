# Bhool Bhulaiyaa // Polymorphic Threat Intelligence Center

Bhool Bhulaiyaa is a next-generation Web3 Honeypot and Threat Intelligence dashboard built for the Hackathon. It intercepts malicious blockchain actors, dynamically classifies their intent, and deploys a generative LLaMA 3 execution environment to trap them.

The system features two core components:
1. **The Polymorphic Execution Engine (FastAPI):** A backend server that intercepts JSON-RPC probes. Depending on the Threat Tier, it either serves static honeytraps or dynamically uses a local AI (Ollama LLaMA 3) to hallucinate an infinitely deep, stateful fake blockchain to trap advanced hackers.
2. **The Intelligence War Room (Next.js):** A beautiful, dark-aesthetic, JWT-authenticated dashboard that visualizes intercepted threats globally, tracks LLM prompt generations, and breaks down the attack taxonomy in real-time.

---

## 🛠 Prerequisites

To run this project, your machine needs the following installed:
* **Node.js** (v18+) and `npm`
* **Python** (v3.10+)
* **Ollama** (v0.5.4+) — Required if you want to deploy the deep GenAI honeypot.

---

## 🚀 Installation & Setup

Since the `.env` files and `node_modules` are safely ignored by GitHub, you need to reconstruct the local environment when pulling this project to a new machine.

### 1. Frontend Setup (Next.js)
```bash
# Install Node dependencies
npm install

# Start the Next.js development server
npm run dev
```
*The frontend will now be available at `http://localhost:3000`.*

### 2. Backend Setup (FastAPI Python)
Open **a new terminal window** and navigate to the `backend` folder:
```bash
cd backend

# Create a clean Python Virtual Environment
python3 -m venv venv

# Activate the Virtual Environment
source venv/bin/activate  # (On Windows, use: venv\Scripts\activate)

# Install required Python packages
pip install -r requirements.txt
```

### 3. Secure the Backend (Authentication Wall)
You must create the secret `.env` file that was intentionally kept off GitHub. Inside the `backend` folder, create a file named `.env` and paste the following inside:
```env
# Change SECRET_KEY to a secure random string in production
SECRET_KEY=1bb5831ea23db1ddfd817fcf8f7be25ebf91b5c4ad503d526e32dca972237eb3

# Default Admin Credentials
# USERNAME: bhool
ADMIN_USER=bhool
# PASSWORD: bhulaiyaa2026 (hashed via PBKDF2)
ADMIN_PASS_HASH=pbkdf2:sha256:260000$P0a1120KjG0a1U3F$03fac9ee03a2fc19e917d526fc1e31eeec82df4bcf3c07e0af6c3b6d7c711a7a
```

### 4. Start the Intelligence Engine
With your backend virtual environment activated, boot the Python API:
```bash
# Ensure you are still inside the `backend` folder and the venv is active
uvicorn main:app --reload --port 8000
```
*The Threat Telemetry API is now listening on port `8000`.*

---

## 🧠 Engaging the Generative LLM (Optional)
If you do not install Ollama, the honeypot will gracefully fall back to a hardcoded "Static Library" mode and continue functioning flawlessly. 

To enable the true intelligence capability:
1. Download Ollama from [ollama.com](https://ollama.com) or run `curl -fsSL https://ollama.com/install.sh | sh`.
2. Open a terminal and run the background model downloader:
   ```bash
   ollama run llama3
   ```
*(Note: LLaMA 3 is a 4.7 GB file and will take a few minutes to pull).*
Once awake, the backend Python server will auto-detect the local AI port and immediately switch to Generative Mode for high-tier threats.

---

## ⚔️ Running the Threat Simulation

Everything is empty when you first boot the system. To populate the dashboard, we included an automated attack script that emulates malicious Web3 bots scanning your honeypot.

Open a **third terminal window** in the root of the project:
```bash
# Run the synthetic traffic generator
npx ts-node scripts/simulate-attack.ts
# If the above command shows error try this : 
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' npx ts-node scripts/simulate-attack.ts
```

---

## 🛡 Accessing the Dashboard

1. Navigate to [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
2. You will be intercepted by the Authentication Wall.
3. Log in using the credentials defined in your `.env`:
   * **Username:** `bhool`
   * **Password:** `bhulaiyaa2026`

---

## Test Honeypot:

1. Smoke test

   ```sh
   python3 test_honeypot_smoke.py
   ```

   Deterministic checks with pass/fail and exit code.

2. If Ollama not-installed 

   ```sh
   OLLAMA_MODE=without-ollama OLLAMA_URL=http://127.0.0.1:65535 ./script.sh
   ```

3. Otherwise

   ```sh
   OLLAMA_MODE=with-ollama ./script.sh
   ```

4. Single command (use ollama or fallback)
   ```sh
   OLLAMA_MODE=auto ./script.sh
   ```

   - with-ollama run: shows PASS: with-ollama mode ready and PASS: Ollama model loaded after BOT traffic.

   - without-ollama run: shows fallback mode message and still produces ledger evidence.

   - Both runs print simulated evidence fields (threat_id, attack_type, status_label, evidence_id, content_hash).

## 🐙 Git Collaboration Flow

If you are working with friends, follow this standard Git flow to push new code to the `sandbox-hackathon` repository without breaking things.

**1. See what files you changed:**
```bash
git status
```

**2. Stage the changed files:**
```bash
git add .
```

**3. Commit your changes with a descriptive message:**
```bash
git commit -m "Added a new widget to the threatening feed UI"
```

**4. Keep your code up-to-date (Pull before you push):**
```bash
git pull origin main
```
*If someone else pushed changes while you were working, this merges their code into yours.*

**5. Push your updates to GitHub:**
```bash
git push origin main
```
