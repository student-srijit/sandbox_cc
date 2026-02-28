import sys
import os
sys.path.append(os.path.dirname(__file__))

from intelligence import intel_logger
from models import AttackClassification

def test_insert():
    record = intel_logger.init_session(
        session_id="test_diag",
        ip="127.0.0.1",
        ua="curl/7.64.1",
        score=100,
        tier="BOT",
        classification=AttackClassification(
            attack_type="DIAGNOSTIC",
            sophistication="script_kiddie",
            inferred_toolchain="Python",
            confidence=1.0
        )
    )
    intel_logger.record_payload("test_diag", "eth_call", "{}", "PROBE")
    saved = intel_logger.finalize_session("test_diag")
    print(f"Finalized: {saved is not None}")

test_insert()
