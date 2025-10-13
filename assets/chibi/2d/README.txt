Place exported 2D layers here to enable the layered mascot preview.

Structure (PNG with transparent background, sized to 100x120 canvas or same aspect):
- assets/chibi/2d/skin-student/body.png
- assets/chibi/2d/skin-ninja/body.png
- assets/chibi/2d/skin-knight/body.png
- assets/chibi/2d/common/eyes.png
- assets/chibi/2d/common/mouth-smile.png
- assets/chibi/2d/hat/red-headband.png
- assets/chibi/2d/scarf/blue.png
- assets/chibi/2d/outfit/sailor.png

You can add more items:
- Add a new file under assets/chibi/2d/<slot>/<name>.png
- Add a CATALOG entry in server.js with { id, kind:'cosmetic', slot:'<slot>', name, price, src:'<path>' }
- Slots: skin, outfit, scarf, hat, eyes, mouth, cheek, body

After adding files:
- Restart the server (npm start) so the catalog updates if you changed server.js.
- Hard reload the Shop/Lesson to see the layered preview.
