import kaplay from "kaplay";

// Catch the falling math balls before they reach the bottom of the screen.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const MAX_MISSES = 3;

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [24, 24, 27],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  k.scene("play", () => {
    let score = 0;
    let misses = 0;
    onScore(0);

    const missLabel = k.add([
      k.text(`Misses: ${misses}/${MAX_MISSES}`, { size: 18 }),
      k.color(255, 255, 255),
      k.pos(16, 16),
    ]);

    const basket = k.add([
      k.rect(84, 20, { radius: 5 }),
      k.color(16, 185, 129),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, VH - 44),
      "basket",
    ]);

    // The pointer works on both touchscreens and computers.
    k.onMouseMove((mpos) => {
      basket.pos.x = k.clamp(mpos.x, 42, VW - 42);
    });
    k.onUpdate(() => {
      if (k.isKeyDown("left")) basket.pos.x = Math.max(42, basket.pos.x - 6);
      if (k.isKeyDown("right")) basket.pos.x = Math.min(VW - 42, basket.pos.x + 6);
    });

    const ballColors = [
      k.rgb(239, 68, 68),   // red
      k.rgb(59, 130, 246),  // blue
      k.rgb(34, 197, 94),   // green
      k.rgb(250, 204, 21),  // yellow
    ];

    function makeProblem() {
      const first = Math.floor(k.rand(1, 10));
      const second = Math.floor(k.rand(1, 10));
      if (k.rand() < 0.5) return `${first} + ${second}`;
      const larger = Math.max(first, second);
      const smaller = Math.min(first, second);
      return `${larger} - ${smaller}`;
    }

    function spawnBall() {
      const ball = k.add([
        k.circle(BALL_RADIUS),
        k.color(k.choose(ballColors)),
        k.area(),
        k.anchor("center"),
        k.pos(k.rand(BALL_RADIUS, VW - BALL_RADIUS), -BALL_RADIUS),
        k.move(k.DOWN, k.rand(120, 200)),
        "math-ball",
      ]);
      const equation = k.add([
        k.text(makeProblem(), { size: 20 }),
        k.color(255, 255, 255),
        k.anchor("center"),
        k.pos(ball.pos.x, ball.pos.y),
      ]);

      // Keep the readable equation centered inside its falling ball.
      ball.onUpdate(() => {
        equation.pos = ball.pos;
      });
      k.wait(k.rand(0.7, 1.15), spawnBall);
    }
    spawnBall();

    basket.onCollide("math-ball", (ball) => {
      k.destroy(ball);
      // The equation is a separate text entity; remove the matching label too.
      k.get("math-label").forEach((label) => {
        if (label.pos.dist(ball.pos) < 1) k.destroy(label);
      });
      score += 1;
      onScore(score);
    });

    k.onUpdate("math-ball", (ball) => {
      if (ball.pos.y > VH + BALL_RADIUS) {
        const ballPosition = ball.pos;
        k.destroy(ball);
        k.get("math-label").forEach((label) => {
          if (label.pos.dist(ballPosition) < 1) k.destroy(label);
        });
        misses += 1;
        missLabel.text = `Misses: ${misses}/${MAX_MISSES}`;
        if (misses >= MAX_MISSES) k.go("over", score);
      }
    });
  });

  k.scene("over", (finalScore: number) => {
    k.add([k.text("Game Over", { size: 40 }), k.anchor("center"), k.pos(VW / 2, VH / 2 - 30), k.color(255, 255, 255)]);
    k.add([k.text(`Score: ${finalScore}`, { size: 24 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 16), k.color(16, 185, 129)]);
    k.add([k.text("tap to play again", { size: 16 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 56), k.color(160, 160, 160)]);
    k.onMousePress(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.go("play");
  return () => k.quit();
}
