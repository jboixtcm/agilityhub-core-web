# Smarter route validation artifacts

These TXT files are isolated validation candidates, not production outputs and not new public-course milestones.

- `wald_1046378_v3_smarter_verified_sadesign.txt` is the frozen Wald external oracle. Its official signed-in Smarter render matched all 12 physical obstacles, all 13 labels, and all 12 route segments; the temporary design was exited without saving.
- `burning_dogs_fallback_v2_aframe_tangent_sadesign.txt` adds five recovered route segments. Its two A-frame-adjacent handles were corrected to the physical right-to-left traversal; the other three recovered routes and every non-target field are unchanged from v1. Offline overlay and parser checks pass; official Smarter visual import is pending.
- `jg3_1029362_plus_3-4_sadesign.txt` adds only route arms for segment 3→4 to the current deterministic JG3 runtime export.
- `switz-a3-m-def_999795_plus_13-14_sadesign.txt` adds only route arms for segment 13→14 to the current deterministic Switz-def runtime export.

The JG3 and Switz candidates multiply normalized route geometry by the raster runtime scale before writing Smarter handle distances. Decoded-diff verification confirms that no obstacle, number, unrelated route arm, or outer setting changed. All four TXT files parse with zero warnings.

The earlier `*_fallback_v1_sadesign.txt` prototypes were removed because they omitted that runtime-scale conversion and therefore wrote route handles one third of the intended distance.

Official Smarter visual import remains pending. Until that check passes and the design is exited with **Ignorar cambios y salir del diseñador**, these files are evidence candidates only.

Verification sources: `/tmp/trusted-route-segment-export-verification.json` and `/tmp/burning-aframe-v2-report.json`.
