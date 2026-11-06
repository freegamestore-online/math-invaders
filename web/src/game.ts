import kaplay from "kaplay";

// Solve each falling math ball by tapping its answer before it reaches the bottom.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const MAX_LIVES = 3;
const BALL_LIMIT_Y = VH - 112;

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
    let lives = MAX_LIVES;
    let nextProblemId = 0;
    const activeProblems = new Map<number, { answer: number; pop: () => void; startFalling: () => void }>();
    const choiceObjects: { destroy: () => void }[] = [];
    onScore(0);

    const scoreLabel = k.add([
      k.text("Score: 0", { size: 18 }),
      k.color(255, 255, 255),
      k.pos(16, 16),
    ]);
    const heartsLabel = k.add([
      k.text("♥ ♥ ♥", { size: 24 }),
      k.color(248, 72, 99),
      k.anchor("topright"),
      k.pos(VW - 16, 12),
    ]);
    const hintLabel = k.add([
      k.text("Get ready...", { size: 16 }),
      k.color(250, 204, 21),
      k.anchor("center"),
      k.pos(VW / 2, VH - 116),
    ]);
    const feedbackLabel = k.add([
      k.text("Choose an answer to start the balloon!", { size: 14 }),
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, VH - 87),
    ]);

    const ballColors = [
      k.rgb(239, 68, 68),
      k.rgb(59, 130, 246),
      k.rgb(34, 197, 94),
      k.rgb(250, 204, 21),
    ];

    function makeProblem(): { text: string; answer: number; hint: string } {
      const first = Math.floor(k.rand(1, 11));
      const second = Math.floor(k.rand(1, 11));
      if (k.rand() < 0.5) {
        return {
          text: `${first} + ${second}`,
          answer: first + second,
          hint: `Hint: start at ${first}, then count up ${second}.`,
        };
      }
      const larger = Math.max(first, second);
      const smaller = Math.min(first, second);
      return {
        text: `${larger} - ${smaller}`,
        answer: larger - smaller,
        hint: `Hint: start at ${larger}, then count back ${smaller}.`,
      };
    }

    function makeChoices(answer: number): number[] {
      const choices = new Set([answer]);
      while (choices.size < 3) {
        const offset = Math.floor(k.rand(1, 5));
        choices.add(Math.max(0, answer + (k.rand() < 0.5 ? -offset : offset)));
      }
      return k.shuffle(Array.from(choices));
    }

    function clearChoices() {
      for (const object of choiceObjects) object.destroy();
      choiceObjects.length = 0;
    }

    function showChoices(answer: number, id: number) {
      clearChoices();
      const choices = makeChoices(answer);
      const choiceRadius = 32;
      const gap = 48;
      const totalWidth = choiceRadius * 2 * choices.length + gap * (choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;

      choices.forEach((choice, index) => {
        const x = startX + index * (choiceRadius * 2 + gap);
        const color = ballColors[index % ballColors.length];
        const button = k.add([
          k.circle(choiceRadius),
          k.color(color),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        button.outline = { color: k.rgb(255, 255, 255), width: 3 };
        const label = k.add([
          k.text(String(choice), { size: 22 }),
          k.color(255, 255, 255),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        button.onClick(() => {
          const problem = activeProblems.get(id);
          if (!problem) return;
          if (choice === problem.answer) {
            problem.pop();
            score += 1;
            scoreLabel.text = `Score: ${score}`;
            onScore(score);
            feedbackLabel.text = "POP! Great job!";
            feedbackLabel.color = k.rgb(34, 197, 94);
            k.wait(0.65, spawnBall);
          } else {
            feedbackLabel.text = "Not quite — the balloon is moving! Try again!";
            feedbackLabel.color = k.rgb(250, 204, 21);
            problem.startFalling();
          }
        });
        choiceObjects.push(button, label);
      });
    }

    function spawnBall() {
      const problem = makeProblem();
      const id = nextProblemId++;
      const ball = k.add([
        k.circle(BALL_RADIUS),
        k.color(k.choose(ballColors)),
        k.anchor("center"),
        k.pos(k.rand(BALL_RADIUS, VW - BALL_RADIUS), -BALL_RADIUS),
      ]);
      const equation = k.add([
        k.text(problem.text, { size: 20 }),
        k.color(255, 255, 255),
        k.anchor("center"),
        k.pos(ball.pos.x, ball.pos.y),
      ]);
      let falling = false;
      const startFalling = () => {
        if (falling) return;
        falling = true;
        ball.use(k.move(k.DOWN, k.rand(120, 200)));
      };

      activeProblems.set(id, {
        answer: problem.answer,
        startFalling,
        pop: () => {
          if (!activeProblems.has(id)) return;
          activeProblems.delete(id);
          clearChoices();
          let scale = 1;
          const shrink = ball.onUpdate(() => {
            scale -= k.dt() * 5;
            ball.scale = k.vec2(Math.max(0, scale));
            equation.scale = k.vec2(Math.max(0, scale));
            equation.pos = ball.pos;
            if (scale <= 0.05) {
              shrink.cancel();
              k.destroy(ball);
              k.destroy(equation);
            }
          });
        },
      });

      hintLabel.text = problem.hint;
      feedbackLabel.text = "Tap the matching answer to pop the balloon!";
      showChoices(problem.answer, id);

      ball.onUpdate(() => {
        equation.pos = ball.pos;
        if (falling && ball.pos.y > BALL_LIMIT_Y) {
          const missed = activeProblems.get(id);
          if (!missed) return;
          missed.pop();
          lives -= 1;
          heartsLabel.text = `${"♥ ".repeat(lives)}${"♡ ".repeat(MAX_LIVES - lives)}`.trim();
          feedbackLabel.text = "A balloon got away! Keep going!";
          feedbackLabel.color = k.rgb(248, 72, 99);
          if (lives <= 0) {
            k.go("over", score);
          } else {
            k.wait(0.65, spawnBall);
          }
        }
      });
    }

    spawnBall();
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
