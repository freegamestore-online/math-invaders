import kaplay from "kaplay";

// Solve each math balloon by choosing its answer before it reaches the ground.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const BALL_GROUND_Y = VH - 165;
const MAX_LIVES = 3;
const MAX_LEVEL = 5;
const QUESTIONS_PER_LEVEL = 5;

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
  let handleTouchAnswer: ((event: PointerEvent) => void) | null = null;
  const handleCanvasPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") handleTouchAnswer?.(event);
  };
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);

  k.scene("menu", () => {
    k.add([
      k.text("🎈 Math Balloon Pop", { size: 32 }),
      k.anchor("center"),
      k.pos(VW / 2, 180),
      k.color(255, 255, 255),
    ]);

    const playBtn = k.add([
      k.rect(200, 70, { radius: 12 }),
      k.color(34, 197, 94),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, 320),
    ]);
    k.add([
      k.text("PLAY", { size: 28 }),
      k.anchor("center"),
      k.pos(VW / 2, 320),
      k.color(255, 255, 255),
    ]);

    playBtn.onClick(() => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.scene("play", () => {
    let score = 0;
    let lives = MAX_LIVES;
    let nextProblemId = 0;
    let currentLevel = 1;
    let selectedProblemId: number | null = null;
    let selectedChoiceIndex = 0;
    let isGameOver = false;
    const activeProblems = new Map<number, {
      answer: number;
      text: string;
      choices: number[];
      pop: () => void;
    }>();
    const choiceObjects: { destroy: () => void }[] = [];
    onScore(0);

    const scoreLabel = k.add([
      k.text("Score: 0", { size: 18 }),
      k.color(255, 255, 255),
      k.pos(16, 16),
    ]);
    const levelLabel = k.add([
      k.text("Level 1/5", { size: 16 }),
      k.color(96, 165, 250),
      k.anchor("center"),
      k.pos(VW / 2, 22),
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
      k.text("Tap a balloon, then tap an answer", { size: 14 }),
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, VH - 87),
    ]);
    k.add([
      k.rect(VW, 4),
      k.color(248, 72, 99),
      k.pos(0, BALL_GROUND_Y),
    ]);

    const ballColors = [
      k.rgb(239, 68, 68),
      k.rgb(59, 130, 246),
      k.rgb(34, 197, 94),
      k.rgb(250, 204, 21),
    ];

    function getLevelForScore(currentScore: number): number {
      return Math.min(MAX_LEVEL, 1 + Math.floor(currentScore / QUESTIONS_PER_LEVEL));
    }

    function updateLevel(): void {
      currentLevel = getLevelForScore(score);
      levelLabel.text = `Level ${currentLevel}/${MAX_LEVEL}`;
    }

    function makeProblem(level: number): { text: string; answer: number } {
      const additionChance = level < 2 ? 0.75 : 0.5;
      const maxValue = 4 + level * 2;
      const smallMax = Math.min(5 + level, 9);
      const first = Math.floor(k.rand(1, maxValue + 1));
      const second = Math.floor(k.rand(1, smallMax + 1));

      if (k.rand() < additionChance) {
        return { text: `${first} + ${second}`, answer: first + second };
      }

      const larger = Math.max(first, second);
      const smaller = Math.min(first, second);
      return { text: `${larger} - ${smaller}`, answer: larger - smaller };
    }

    function makeChoices(answer: number, level: number): number[] {
      const choices = new Set([answer]);
      const spread = Math.min(5, 2 + level);
      while (choices.size < 3) {
        const offset = Math.floor(k.rand(1, spread + 1));
        const candidate = Math.max(0, answer + (k.rand() < 0.5 ? -offset : offset));
        choices.add(candidate);
      }
      return k.shuffle(Array.from(choices));
    }

    function clearChoices(): void {
      for (const object of choiceObjects) object.destroy();
      choiceObjects.length = 0;
    }

    function updateTargetLabel(): void {
      const ids = Array.from(activeProblems.keys());
      if (selectedProblemId === null || ids.length === 0) {
        hintLabel.text = "Waiting for the next balloon...";
        return;
      }
      const index = ids.indexOf(selectedProblemId);
      const problem = activeProblems.get(selectedProblemId);
      if (problem) hintLabel.text = `Target ${index + 1}/${ids.length}: ${problem.text} = ?`;
    }

    function showChoices(): void {
      clearChoices();
      updateTargetLabel();
      if (selectedProblemId === null) return;
      const targetId = selectedProblemId;
      const problem = activeProblems.get(targetId);
      if (!problem) return;

      const choiceRadius = 30;
      const gap = 30;
      const totalWidth = choiceRadius * 2 * problem.choices.length + gap * (problem.choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;

      problem.choices.forEach((choice, index) => {
        const x = startX + index * (choiceRadius * 2 + gap);
        const answerThisChoice = () => resolveProblem(targetId, choice);
        const button = k.add([
          k.circle(choiceRadius),
          k.color(ballColors[index % ballColors.length]),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        button.outline = {
          color: k.rgb(255, 255, 255),
          width: index === selectedChoiceIndex ? 4 : 1,
        };
        button.onClick(answerThisChoice);
        const label = k.add([
          k.text(String(choice), { size: 22 }),
          k.color(255, 255, 255),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        label.onClick(answerThisChoice);
        choiceObjects.push(button, label);
      });
    }

    function endGame(): void {
      if (isGameOver) return;
      isGameOver = true;
      clearChoices();
      k.wait(0.65, () => k.go("over", score));
    }

    function loseLife(message: string): void {
      lives -= 1;
      heartsLabel.text = `${"♥ ".repeat(Math.max(0, lives))}${"♡ ".repeat(MAX_LIVES - Math.max(0, lives))}`.trim();
      feedbackLabel.text = message;
      feedbackLabel.color = k.rgb(248, 72, 99);
      if (lives <= 0) endGame();
    }

    function resolveProblem(id: number, choice: number): void {
      const problem = activeProblems.get(id);
      if (!problem || isGameOver || selectedProblemId !== id) return;
      problem.pop();

      if (choice === problem.answer) {
        score += 1;
        updateLevel();
        scoreLabel.text = `Score: ${score}`;
        onScore(score);
        feedbackLabel.text = "POP! Other balloons keep falling!";
        feedbackLabel.color = k.rgb(34, 197, 94);
      } else {
        loseLife("Wrong answer — the balloon popped!");
      }

      if (isGameOver) return;
      selectedProblemId = activeProblems.keys().next().value ?? null;
      selectedChoiceIndex = 0;
      showChoices();
    }

    function selectBalloon(direction: number): void {
      const ids = Array.from(activeProblems.keys());
      if (ids.length === 0) return;
      const currentIndex = selectedProblemId === null ? -1 : ids.indexOf(selectedProblemId);
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + ids.length) % ids.length;
      selectedProblemId = ids[nextIndex];
      selectedChoiceIndex = 0;
      showChoices();
    }

    function answerAtChoice(index: number): void {
      if (selectedProblemId === null) return;
      const problem = activeProblems.get(selectedProblemId);
      if (!problem) return;
      selectedChoiceIndex = index;
      resolveProblem(selectedProblemId, problem.choices[index]);
    }

    handleTouchAnswer = (event) => {
      if (isGameOver || selectedProblemId === null) return;
      const problem = activeProblems.get(selectedProblemId);
      if (!problem) return;

      // Convert the tap to the virtual game coordinates, including letterboxing.
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / VW, rect.height / VH);
      const offsetX = (rect.width - VW * scale) / 2;
      const offsetY = (rect.height - VH * scale) / 2;
      const x = (event.clientX - rect.left - offsetX) / scale;
      const y = (event.clientY - rect.top - offsetY) / scale;
      if (y < VH - 42 - 42 || y > VH - 42 + 42) return;

      const choiceRadius = 30;
      const gap = 30;
      const totalWidth = choiceRadius * 2 * problem.choices.length + gap * (problem.choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;
      problem.choices.forEach((_, index) => {
        const choiceX = startX + index * (choiceRadius * 2 + gap);
        if (Math.hypot(x - choiceX, y - (VH - 42)) <= choiceRadius + 12) {
          event.preventDefault();
          answerAtChoice(index);
        }
      });
    };

    k.onKeyPress("up", () => selectBalloon(-1));
    k.onKeyPress("left", () => answerAtChoice(0));
    k.onKeyPress("down", () => answerAtChoice(1));
    k.onKeyPress("right", () => answerAtChoice(2));

    function spawnBall(): void {
      if (isGameOver) return;
      updateLevel();
      const problem = makeProblem(currentLevel);
      const id = nextProblemId++;
      const ball = k.add([
        k.circle(BALL_RADIUS),
        k.color(k.choose(ballColors)),
        k.area(),
        k.anchor("center"),
        k.pos(k.rand(BALL_RADIUS, VW - BALL_RADIUS), -BALL_RADIUS),
      ]);
      const equation = k.add([
        k.text(problem.text, { size: 20 }),
        k.color(255, 255, 255),
        k.area(),
        k.anchor("center"),
        k.pos(ball.pos.x, ball.pos.y),
      ]);

      activeProblems.set(id, {
        answer: problem.answer,
        text: problem.text,
        choices: makeChoices(problem.answer, currentLevel),
        pop: () => {
          if (!activeProblems.has(id)) return;
          activeProblems.delete(id);
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

      const selectThisBalloon = () => {
        if (isGameOver || !activeProblems.has(id)) return;
        selectedProblemId = id;
        selectedChoiceIndex = 0;
        showChoices();
      };
      ball.onClick(selectThisBalloon);
      equation.onClick(selectThisBalloon);

      if (selectedProblemId === null) selectedProblemId = id;
      showChoices();

      ball.onUpdate(() => {
        if (isGameOver || !activeProblems.has(id)) return;
        const fallSpeed = 48 + (currentLevel - 1) * 16;
        ball.pos.y += fallSpeed * k.dt();
        equation.pos = ball.pos;
        if (ball.pos.y + BALL_RADIUS >= BALL_GROUND_Y) {
          const missedProblem = activeProblems.get(id);
          if (!missedProblem) return;
          missedProblem.pop();
          loseLife("A balloon hit the ground — life lost!");
          if (!isGameOver) {
            if (selectedProblemId === id) selectedProblemId = activeProblems.keys().next().value ?? null;
            showChoices();
          }
        }
      });
    }

    function scheduleNextBall(): void {
      const delay = Math.max(1.6, 3.4 - (currentLevel - 1) * 0.35);
      k.wait(delay, () => {
        if (isGameOver) return;
        spawnBall();
        scheduleNextBall();
      });
    }

    spawnBall();
    scheduleNextBall();
  });

  k.scene("over", (finalScore: number) => {
    k.add([k.text("Game Over", { size: 40 }), k.anchor("center"), k.pos(VW / 2, VH / 2 - 30), k.color(255, 255, 255)]);
    k.add([k.text(`Score: ${finalScore}`, { size: 24 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 16), k.color(16, 185, 129)]);
    k.add([k.text("tap or press Enter to play again", { size: 16 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 56), k.color(160, 160, 160)]);
    k.onMousePress(() => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.go("menu");
  return () => {
    handleTouchAnswer = null;
    canvas.removeEventListener("pointerdown", handleCanvasPointerDown);
    k.quit();
  };
}
