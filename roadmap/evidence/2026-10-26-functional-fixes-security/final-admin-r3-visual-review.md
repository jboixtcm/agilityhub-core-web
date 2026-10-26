# Independent admin visual delta review — 26 October 2026

Reviewed the 19 changed or added original PNGs in the admin-gallery partition of final browser run41 (`2026-10-26-functional-fixes-final-r3/`), using original-resolution image viewing. This comprises seven changed images and the 12 new open billing-menu captures. All 19 paths and hashes are in [final-admin-r3-visual-reviewed-inputs.json](final-admin-r3-visual-reviewed-inputs.json).

The current admin index contains 82 images. Independently recomputed hashes confirm that its other 63 images are byte-identical to the prior reviewed set. The earlier contact-sheet overview remains applicable to those 63; 11 additionally retain prior individual-original review. No new contact sheets were opened, and this is not a claim of individual/pixel inspection of all 82 captures. The earlier [review](final-admin-visual-review.md) remains the provenance for unchanged images; the findings below supersede its relevant changed states.

## Findings

- The four billing menus (Filter, Columns, Views, Excel/PDF) are visible with their labels and controls inside the page at all three captured widths, 375/768/1280 px. The previous negative-left clipping is absent in these actual open states, including the tablet width.
- In the changed 375 px billing image, the cash-payment member names, future-leave dates, row dividers and “Obre fitxa” controls remain inside the simulation card. The previously identified row/card protrusion is resolved in this capture. Values remain readable with wrapping.
- Course creation menus at 768/1280 px and the 1280 px import dialog remain contained and legible. The library's changed 375/768 px captures preserve the header, tabs, search and table entry points. The wide list shows a clipped viewport onto its horizontal content as designed; still images do not independently prove scroll interaction.
- `r2-course-ui-harness-1280-after-nudge.png` again captures the upper 3D canvas before a settled scene is visible. This harness screenshot still does not assert model readiness and does not establish a persistent rendering failure. The dedicated [settled light/dark WebGL probe](../2026-10-26-functional-fixes-course3d-probe/REPORT.md), including individually reviewed before/after scene originals, remains the relevant post-nudge rendering evidence. No course renderer/model source changed between that probe and run41.

No new actionable visual defect was found in these 19 originals. This is a bounded review of the changed admin-gallery captures, not a guarantee about unexecuted states, every receipt row, every browser/GPU or all image pixels. The root and other agent own changed images in the other-flow/member partitions.

## Provenance and limits

Run41's retained summary reports exit0 and all946 inputs unchanged. The root's width-candidate check is separate geometric evidence, not proof that every descendant is visible. This review directly inspected actual open menus rather than treating closed-panel DOM bounds as a bug. No product/source edits, test reruns, external-provider operations or deployment were performed.
