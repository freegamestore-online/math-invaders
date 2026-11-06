import kaplay from "kaplay";

// Catch each falling math ball by typing its answer before it reaches the bottom.
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
    let answerInput = "";
    let nextProblemId = 0;
    const activeProblems = new Map<number, { answer: number; pop: () => void }>();
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

    const answerBox = k.add([
      k.rect(220, 54, { radius: 10 }),
      k.color(45, 50, 64),
      k.anchor("center"),
      k.pos(VW / 2, VH - 42),
    ]);
    answerBox.outline = { color: k.rgb(250, 204, 21), width: 3 };
    k.add([
      k.text("TYPE ANSWER  •  ENTER", { size: 14 }),
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, VH - 87),
    ]);
    const inputLabel = k.add([
      k.text("", { size: 26 }),
      k.color(255, 255, 255),
      k.anchor("center"),
      k.pos(VW / 2, VH - 42),
    ]);
    const feedbackLabel = k.add([
      k.text("Solve a ball to pop it!", { size: 14 }),
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, VH - 120),
    ]);

    function updateInput() {
      inputLabel.text = answerInput || "_";
    }

    function submitAnswer() {
      if (!answerInput) return;
      const answer = Number(answerInput);
      answerInput = "";
      updateInput();
      const match = Array.from(activeProblems.values()).find((problem) => problem.answer === answer);
      if (!match) {
        feedbackLabel.text = "Not quite — try another answer!";
        feedbackLabel.color = k.rgb(250, 204, 21);
        return;
      }

      match.pop();
      score += 1;
      scoreLabel.text = `Score: ${score}`;
      onScore(score);
      feedbackLabel.text = "POP! Great job!";
      feedbackLabel.color = k.rgb(34, 197, 94);
    }

    for (const digit of "0123456789") {
      k.onKeyPress(digit, () => {
        if (answerInput.length < 3) answerInput += digit;
        updateInput();
      });
    }
    k.onKeyPress("backspace", () => {
      answerInput = answerInput.slice(0, -1);
      updateInput();
    });
    k.onKeyPress("enter", submitAnswer);
    k.onKeyPress("numenter", submitAnswer);

    const ballColors = [
      k.rgb(239, 68, 68),   // red
      k.rgb(59, 130, 246),  // blue
      k.rgb(34, 197, 94),   // green
      k.rgb(250, 204, 21),  // yellow
    ];

    function makeProblem(): { text: string; answer: number } {
      const first = Math.floor(k.rand(1, 11));
      const second = Math.floor(k.rand(1, 11));
      if (k.rand() < 0.5) {
        return { text: `${first} + ${second}`, answer: first + second };
      }
      const larger = Math.max(first, second);
      const smaller = Math.min(first, second);
      return { text: `${larger} - ${smaller}`, answer: larger - smaller };
    }

    function spawnBall() {
      const problem = makeProblem();
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
        k.text(problem.text, { size: 20 }),
        k.color(255, 255, 255),
        k.anchor("center"),
        k.pos(ball.pos.x, ball.pos.y),
      ]);
      const id = nextProblemId++;
      activeProblems.set(id, {
        answer: problem.answer,
        pop: () => {
          k.destroy(ball);
          k.destroy(equation);
          activeProblems.delete(id);
        },
      });

      // Keep the equation centered in its ball and pop the pair together on a hit.
      ball.onUpdate(() => {
        equation.pos = ball.pos;
        if (ball.pos.y > BALL_LIMIT_Y) {
          const missed = activeProblems.get(id);
          if (!missed) return;
          missed.pop();
          lives -= 1;
          heartsLabel.text = `${"♥ ".repeat(lives)}${"♡ ".repeat(MAX_LIVES - lives)}`.trim();
          feedbackLabel.text = "A ball got away! Keep going!";
          feedbackLabel.color = k.rgb(248, 72, 99);
          if (lives <= 0) k.go("over", score);
        }
      });
      k.wait(k.rand(0.8, 1.2), spawnBall);
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
