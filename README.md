# template-game-kaplay

## Mobile viewport defaults

The app starts at device width with page zoom restricted by the viewport meta tag
and `touch-action: pan-x pan-y` in `web/src/index.css`. The root clips horizontal
page overflow; vertical scrolling and explicit inner scrollers remain available.
Keep layouts responsive at 320px and put wide tables/carousels in their own scroll
containers. Maps and game canvases can handle their own gestures.

These defaults also apply when launched from the home screen. Browser or accessibility
settings can override zoom restrictions. FGS compliance requires the viewport zoom
restriction; provide game-level zoom controls for maps or images instead of removing
it. Keep the app's text-size controls available.
