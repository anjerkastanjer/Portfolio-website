"""Sculpt public/portrait-depth.png, the depth map behind the 3D face.

There is no depth model here on purpose: the eyes were found with OpenCV's Haar cascades, and
the head is built from simple shapes placed relative to them (skull, nose ridge and tip, eye
sockets, brow, cheekbones, lips, chin, neck, shoulders). Run from the repo root:

    python tools/portrait-depth.py

It also writes portrait-depth-preview.png: the map, and the map lit from the upper left.
"""

import cv2
import numpy as np

im = cv2.imread("public/portrait.png", cv2.IMREAD_UNCHANGED)
alpha = im[:, :, 3].astype(np.float32) / 255
H, W = alpha.shape
y, x = np.mgrid[0:H, 0:W].astype(np.float32)

# Landmarks from the Haar detection (pixels in the 320 x 320 portrait).
le, re_ = (119.5, 133.5), (181.0, 132.0)
cx = (le[0] + re_[0]) / 2  # face centre line
ey = (le[1] + re_[1]) / 2  # eye line
E = re_[0] - le[0]  # eye distance, the unit for everything else
tip = (cx, ey + 0.58 * E)  # nose tip
mouth = (cx + 2, ey + 0.98 * E)
chin = (cx, ey + 1.6 * E)


def g(px, py, sx, sy=None):
    sy = sy or sx
    return np.exp(-(((x - px) / sx) ** 2 + ((y - py) / sy) ** 2) / 2)


# Head: an ellipsoid, rounder on top (skull and hair), tighter towards the jaw.
hcx, hcy = cx, ey + 0.1 * E
rx = 1.62 * E
ry = np.where(y < hcy, 2.1 * E, 1.75 * E)
head = np.sqrt(np.clip(1 - ((x - hcx) / rx) ** 2 - ((y - hcy) / ry) ** 2, 0, 1))
# Kept fully round, so the front joins the back of the head (added in src/shapes.ts) without a seam.

face = np.zeros_like(x)
# Nose ridge from between the eyes to the tip, growing towards the tip, then the tip itself.
t = np.clip((y - (ey - 0.05 * E)) / (tip[1] - (ey - 0.05 * E)), 0, 1)
ridge = np.exp(-(((x - cx) / (0.17 * E)) ** 2) / 2) * t**1.3 * (y < tip[1] + 0.05 * E)
face += 0.05 * ridge
face += 0.07 * g(tip[0], tip[1], 0.22 * E, 0.18 * E)
face += 0.025 * g(cx - 0.2 * E, tip[1] + 0.05 * E, 0.12 * E) + 0.025 * g(cx + 0.2 * E, tip[1] + 0.05 * E, 0.12 * E)
# Eye sockets sit back; the brow above them sticks out a bit.
for ex, eyy in (le, re_):
    face -= 0.07 * g(ex, eyy, 0.24 * E, 0.2 * E)
    face += 0.035 * g(ex, eyy - 0.32 * E, 0.3 * E, 0.12 * E)
# Cheekbones, lips, chin.
face += 0.04 * g(le[0] - 0.05 * E, ey + 0.55 * E, 0.32 * E) + 0.04 * g(re_[0] + 0.05 * E, ey + 0.55 * E, 0.32 * E)
face += 0.045 * g(mouth[0], mouth[1], 0.42 * E, 0.14 * E)
face += 0.04 * g(chin[0], chin[1], 0.3 * E, 0.2 * E)
# The facial features only exist inside the face, not on the hair or ears.
facemask = g(cx, ey + 0.55 * E, 0.9 * E, 1.1 * E) ** 0.5
head = head + face * facemask

# Neck: a cylinder set back behind the jaw. Torso: a wide, shallow curve further back.
neck = 0.42 * np.sqrt(np.clip(1 - ((x - cx) / (0.85 * E)) ** 2, 0, 1)) * (y > chin[1] - 0.3 * E)
torso = (0.32 * np.sqrt(np.clip(1 - ((x - cx) / (2.9 * E)) ** 2, 0, 1)) - 0.05) * (y > chin[1] + 0.25 * E)
depth = np.maximum.reduce([head, neck, torso])
depth = cv2.GaussianBlur(depth, (0, 0), 1.5)
# Stored as 0..255 for 0..1.5; src/shapes.ts scales it back.
depth = np.clip(depth, 0, 1.5) / 1.5 * (alpha > 0.5)

cv2.imwrite("public/portrait-depth.png", (depth * 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])

# Preview: light the depth map from the upper left, to check the shape reads as a head.
dz = (depth * 1.5 * 60).astype(np.float32)
gx = cv2.Sobel(dz, cv2.CV_32F, 1, 0, ksize=3) / 8
gy = cv2.Sobel(dz, cv2.CV_32F, 0, 1, ksize=3) / 8
n = np.dstack([-gx, -gy, np.ones_like(gx)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
L = np.array([-0.5, -0.6, 0.62])
L /= np.linalg.norm(L)
shade = np.clip(n @ L, 0, 1) * (alpha > 0.5)
preview = np.hstack([(depth * 255).astype(np.uint8), (shade * 255).astype(np.uint8)])
cv2.imwrite("portrait-depth-preview.png", cv2.resize(preview, (1280, 640)))
print("wrote public/portrait-depth.png")
