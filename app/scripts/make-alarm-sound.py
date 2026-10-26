"""Generates assets/sounds/alarm.wav: a bright three-note chime that loops
cleanly (about 2 seconds). Run from the app folder: python3 scripts/make-alarm-sound.py"""
import math, struct, wave

RATE = 22050
NOTES = [(1046.5, 0.18), (1318.5, 0.18), (1568.0, 0.30)]  # C6, E6, G6
GAP, REST = 0.06, 0.55

def tone(freq, dur):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        attack = min(1.0, t / 0.01)
        decay = math.exp(-4.0 * t / dur)
        # a little second harmonic makes it ring like a bell
        s = math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(4 * math.pi * freq * t)
        out.append(0.55 * attack * decay * s)
    return out

samples = []
for _ in range(2):
    for freq, dur in NOTES:
        samples += tone(freq, dur) + [0.0] * int(RATE * GAP)
    samples += [0.0] * int(RATE * REST / 2)

with wave.open("assets/sounds/alarm.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
print(f"wrote assets/sounds/alarm.wav ({len(samples) / RATE:.1f}s)")
