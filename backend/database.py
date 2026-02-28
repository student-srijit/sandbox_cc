import sqlite3
import json
from pathlib import Path
from typing import Dict, Any, List
from models import ThreatRecord, PayloadLog

DB_DIR = Path(__file__).parent / "data"
DB_PATH = DB_DIR / "honeypot.db"

def init_db():
    """
    Initializes the local SQLite database for threat telemetry.
    This creates the necessary tables if they don't exist yet.
    """
    DB_DIR.mkdir(parents=True, exist_ok=True)
    
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        
        # We store the complex ThreatRecord as a dumped JSON blob 
        # to simplify schema management while maintaining fast insert speeds.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS threat_logs (
                id TEXT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                attack_type TEXT,
                sophistication TEXT,
                tier TEXT,
                full_record JSON
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_timestamp ON threat_logs (timestamp)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_ip ON threat_logs (ip_address)
        ''')
        
        conn.commit()

def log_threat(record: ThreatRecord):
    """
    Persists a completed ThreatRecord into the database.
    This is called when a Tier 3 attacker session concludes or escalates.
    """
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        
        # Convert Pydantic model to dictionary, then stringify for JSON column
        record_dict = record.model_dump()
        print(f"DEBUG: Attempting to flush threat record {record.threat_id} to SQLite DB at {DB_PATH}")
        
        try:
            cursor.execute('''
                INSERT INTO threat_logs 
                (id, ip_address, attack_type, sophistication, tier, full_record)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                record.threat_id,
                record.network.entry_ip,
                record.classification.attack_type,
                record.classification.sophistication,
                record.network.tier,
                json.dumps(record_dict)
            ))
            conn.commit()
            print(f"DEBUG: Successfully flushed threat record {record.threat_id}")
        except Exception as e:
            print(f"DEBUG: SQLite Integrity Error or Exception during flush: {e}")

def get_recent_threats(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieves the most recent threat records for the Live Dashboard.
    Reads descending by timestamp to feed the Threat Map.
    """
    if not DB_PATH.exists():
        return []
        
    with sqlite3.connect(DB_PATH) as conn:
        # Return dicts instead of tuples for easy JSON serialization
        conn.row_factory = sqlite3.Row  
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT full_record FROM threat_logs
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        
        # Rehydrate the JSON strings back into Python dictionaries
        return [json.loads(row['full_record']) for row in rows]

def get_dashboard_aggregates() -> Dict[str, Any]:
    """
    Computes all-time aggregates for the Attack Taxonomy and Polymorphic Generation graphs.
    """
    if not DB_PATH.exists():
        return {"total_threats": 0, "taxonomy": [], "total_generations": 0}
        
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM threat_logs")
        total_threats = cursor.fetchone()[0] or 0
        
        cursor.execute("""
            SELECT attack_type, COUNT(*) as count 
            FROM threat_logs 
            GROUP BY attack_type 
            ORDER BY count DESC
        """)
        
        # Calculate a pseudo-severity based on frequency to match the original UI styling
        taxonomy = [
            {
                "name": row[0], 
                "count": row[1], 
                "severity": min(0.9, 0.4 + (row[1] / max(1, total_threats)))
            } for row in cursor.fetchall()
        ]
        
        # Calculate the total LLM prompts/payloads served across all historical dossiers
        try:
            cursor.execute("SELECT SUM(json_extract(full_record, '$.timeline.total_requests')) FROM threat_logs")
            total_generations = cursor.fetchone()[0] or 0
        except Exception:
            total_generations = total_threats
            
        return {
            "total_threats": total_threats,
            "taxonomy": taxonomy,
            "total_generations": total_generations
        }
