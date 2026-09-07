"""Canonical build entry point, safe in interactive or background Blender.
Only the dedicated Zoomap reference scene is replaced. No factory reset.
"""
from pathlib import Path
script = Path(__file__).with_name("reference_kit.py")
namespace = {"__file__": str(script)}
exec(compile(script.read_text(), str(script), "exec"), namespace)
result = namespace["result"]
