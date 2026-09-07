# Novelty concept references

These three generated sheets are authoring targets for original modular accessories. They use the user's [hair study](../hair.png) for the angular silhouettes, strong ink and controlled cel shading. They are not Blender renders or proof of working combinations. Their visual annotations are reference material, not additional user instructions.

| Sheet                              | Component              | Preserve in the model                                                                                                       |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Quack Captain](quack.png)         | `hat-quack-captain`    | Joined yellow duck body/head, orange flattened bill, splayed wings, raised tail and chunky teal float over a wearable crown |
| [Starstruck Specs](starstruck.png) | `acc-starstruck`       | Open star and crescent frames, visible eye openings, gold bridge and curved stems with teal ends                            |
| [Pocket Galaxy](galaxy.png)        | `effect-pocket-galaxy` | Solid mint UFO, gold Saturn with tilted teal ring, coral star and three short orbit marks                                   |

Every sheet contains front, left-facing side, back and top views of the intended same object. Preserve a coherent three-dimensional shape when generated views disagree. Avoid copying a favorable front silhouette at the expense of the side or top.

[provenance.json](provenance.json) records the September 7, 2026 image-generation prompts, style input, original generated files and saved filenames. The prompts specify the object designs, neutral mannequin context, four-view consistency, practical volumes and absence of unwanted logos or extra ornaments. These sheets are also packed as viewport-only guides in the dedicated Blender scene.

Editable implementations are [novelty_quack.py](../../../assets/source/novelty_quack.py), [novelty_specs.py](../../../assets/source/novelty_specs.py) and [novelty_galaxy.py](../../../assets/source/novelty_galaxy.py). Follow the [novelty workflow](../../novelty-workflow.md) for interactive rebuilding, named cameras, fitting declarations, iteration findings and qualification status.

Actual Blender evidence lives separately in [docs/evidence/novelty](../../evidence/novelty/), including `blender-{style}-{view}.png` and retained iteration sheets. Final browser evidence must use exported GLBs and the shipping fitting/rendering code. An attractive generated sheet, an intermediate Blender render and a qualified browser combination are distinct artifacts.
