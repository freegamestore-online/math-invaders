import kaplay from "kaplay";

// Solve each math balloon by choosing its answer before it reaches the ground.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const BALL_GROUND_Y = VH - 165;
const MAX_LIVES = 3;
const MAX_LEVEL = 5;
const QUESTIONS_PER_LEVEL = 5;
const LEVEL_NAMES = ["Addition", "Subtraction", "Multiplication", "Division", "Percentage"] as const;

export function startGame(
  canvas: HTMLCanvasElement,
  onScore: (n: number) => void,
): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [24, 24, 27],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });
  let handleCanvasAnswer: ((event: PointerEvent) => void) | null = null;
  let togglePause = () => {};
  const handleCanvasPointerDown = (event: PointerEvent) => handleCanvasAnswer?.(event);
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);

  k.scene("menu", () => {
    togglePause = () => {};
    onScore(0);
    k.add([
      k.text("🎈 Math Balloon Pop", { size: 32 }),
      k.anchor("center"),
      k.pos(VW / 2, 90),
      k.color(255, 255, 255),
    ]);

    LEVEL_NAMES.forEach((_, index) => {
      k.add([
        k.text(`Level ${index + 1}`, { size: 20 }),
        k.anchor("center"),
        k.pos(VW / 2, 175 + index * 36),
        k.color(255, 255, 255),
      ]);
    });

    const playBtn = k.add([
      k.rect(200, 70, { radius: 12 }),
      k.color(34, 197, 94),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, 465),
    ]);
    k.add([
      k.text("PLAY", { size: 28 }),
      k.anchor("center"),
      k.pos(VW / 2, 465),
      k.color(255, 255, 255),
    ]);

    playBtn.onClick(() => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.scene("play", (startLevel: number = 1) => {
    let score = 0;
    let lives = MAX_LIVES;
    let nextProblemId = 0;
    let currentLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(startLevel)));
    let correctAnswersInLevel = 0;
    let selectedProblemId: number | null = null;
    let selectedChoiceIndex = 0;
    let isGameOver = false;
    let isPaused = false;
    let nextBallIn = 0;
    const pauseObjects: { destroy: () => void }[] = [];
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
      k.text(`Level ${currentLevel}/${MAX_LEVEL}`, { size: 16 }),
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
    const pauseButton = k.add([
      k.rect(122, 44, { radius: 8 }),
      k.color(63, 63, 70),
      k.area(),
      k.anchor("center"),
      k.pos(63, 68),
    ]);
    const pauseButtonLabel = k.add([
      k.text("PAUSE ⏸️", { size: 13 }),
      k.anchor("center"),
      k.pos(63, 68),
      k.color(255, 255, 255),
    ]);
    pauseButton.onClick(() => togglePause());
    const restartButton = k.add([
      k.rect(122, 44, { radius: 8 }),
      k.color(37, 99, 235),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, 68),
    ]);
    k.add([
      k.text("RESTART 🔁", { size: 13 }),
      k.anchor("center"),
      k.pos(VW / 2, 68),
      k.color(255, 255, 255),
    ]);
    restartButton.onClick(() => k.go("play", currentLevel));
    const stopButton = k.add([
      k.rect(122, 44, { radius: 8 }),
      k.color(220, 38, 38),
      k.area(),
      k.anchor("center"),
      k.pos(337, 68),
    ]);
    k.add([
      k.text("STOP ⏹️", { size: 13 }),
      k.anchor("center"),
      k.pos(337, 68),
      k.color(255, 255, 255),
    ]);
    stopButton.onClick(() => k.go("menu"));
    k.add([
      /*k.text("⌨ Arrow Keys Supported\n↑ Select Balloon\n← ↓ → Choose Answers", { size: 14 }),*/
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, 76),
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

    function updateLevel(): void {
      levelLabel.text = `Level ${currentLevel}/${MAX_LEVEL}: ${LEVEL_NAMES[currentLevel - 1]}`;
    }

    function makeProblem(level: number): { text: string; answer: number } {
      if (level === 1) {
        const first = Math.floor(k.rand(1, 7));
        const second = Math.floor(k.rand(1, 7));
        return { text: `${first} + ${second}`, answer: first + second };
      }

      if (level === 2) {
        const first = Math.floor(k.rand(1, 13));
        const second = Math.floor(k.rand(1, 13));
        const larger = Math.max(first, second);
        const smaller = Math.min(first, second);
        return { text: `${larger} - ${smaller}`, answer: larger - smaller };
      }

      if (level === 3) {
        const first = Math.floor(k.rand(2, 10));
        const second = Math.floor(k.rand(2, 10));
        return { text: `${first} × ${second}`, answer: first * second };
      }

      if (level === 4) {
        const divisor = Math.floor(k.rand(2, 10));
        const quotient = Math.floor(k.rand(2, 10));
        return { text: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
      }

      const percent = k.choose([10, 20, 25, 50, 75]);
      const amount = k.choose([20, 40, 60, 80, 100]);
      return { text: `${percent}% of ${amount}`, answer: (percent * amount) / 100 };
    }

    function makeChoices(answer: number, level: number): number[] {
      const choices = new Set([answer]);
      const spread = Math.min(5, 2 + level);
      while (choices.size < 3) {
        const offset = Math.floor(k.rand(1, spread + 1));
        const candidate = Math.max(0, answer + (k.rand(0, 1) < 0.5 ? -offset : offset));
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
      const problem = activeProblems.get(selectedProblemId);
      if (!problem) return;

      const choiceRadius = 30;
      const gap = 30;
      const totalWidth = choiceRadius * 2 * problem.choices.length + gap * (problem.choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;

      problem.choices.forEach((choice, index) => {
        const x = startX + index * (choiceRadius * 2 + gap);
        const button = k.add([
          k.circle(choiceRadius),
          k.color(ballColors[index % ballColors.length] ?? k.rgb(255, 255, 255)),
          k.outline(index === selectedChoiceIndex ? 4 : 1, k.rgb(255, 255, 255)),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        const label = k.add([
          k.text(String(choice), { size: 22 }),
          k.color(255, 255, 255),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        choiceObjects.push(button, label);
      });
    }

    function setPaused(paused: boolean): void {
      if (isPaused === paused || isGameOver) return;
      isPaused = paused;
      clearChoices();
      for (const object of pauseObjects) object.destroy();
      pauseObjects.length = 0;
      pauseButtonLabel.text = isPaused ? "RESUME" : "PAUSE";

      if (isPaused) {
        pauseObjects.push(
          k.add([
            k.rect(280, 116, { radius: 16 }),
            k.color(50, 50, 58),
            k.anchor("center"),
            k.pos(VW / 2, VH / 2),
          ]),
          k.add([
            k.text("Paused\nTap Resume to continue", { size: 20, align: "center", width: 260 }),
            k.anchor("center"),
            k.pos(VW / 2, VH / 2),
            k.color(255, 255, 255),
          ]),
        );
      } else {
        showChoices();
      }
    }

    togglePause = () => setPaused(!isPaused);

    function endGame(): void {
      if (isGameOver) return;
      isGameOver = true;
      togglePause = () => {};
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
        correctAnswersInLevel += 1;
        if (correctAnswersInLevel >= QUESTIONS_PER_LEVEL && currentLevel < MAX_LEVEL) {
          currentLevel += 1;
          correctAnswersInLevel = 0;
        }
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
      if (isPaused) return;
      const ids = Array.from(activeProblems.keys());
      if (ids.length === 0) return;
      const currentIndex = selectedProblemId === null ? -1 : ids.indexOf(selectedProblemId);
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + ids.length) % ids.length;
      selectedProblemId = ids[nextIndex] ?? null;
      selectedChoiceIndex = 0;
      showChoices();
    }

    function answerAtChoice(index: number): void {
      if (isPaused) return;
      if (selectedProblemId === null) return;
      const problem = activeProblems.get(selectedProblemId);
      if (!problem) return;
      selectedChoiceIndex = index;
      const choice = problem.choices[index];
      if (choice === undefined) return;
      resolveProblem(selectedProblemId, choice);
    }

    handleCanvasAnswer = (event) => {
      if (isPaused || isGameOver || selectedProblemId === null) return;
      const problem = activeProblems.get(selectedProblemId);
      if (!problem) return;

      // Convert pointer coordinates to virtual game coordinates, including letterboxing.
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scale = Math.min(rect.width / VW, rect.height / VH);
      const offsetX = (rect.width - VW * scale) / 2;
      const offsetY = (rect.height - VH * scale) / 2;
      const x = (event.clientX - rect.left - offsetX) / scale;
      const y = (event.clientY - rect.top - offsetY) / scale;
      const choiceY = VH - 42;
      if (Math.abs(y - choiceY) > 42) return;

      const choiceRadius = 30;
      const gap = 30;
      const totalWidth = choiceRadius * 2 * problem.choices.length + gap * (problem.choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;
      for (let index = 0; index < problem.choices.length; index += 1) {
        const choiceX = startX + index * (choiceRadius * 2 + gap);
        if (Math.hypot(x - choiceX, y - choiceY) <= choiceRadius + 12) {
          event.preventDefault();
          answerAtChoice(index);
          return;
        }
      }
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
        k.scale(1),
        k.pos(k.rand(BALL_RADIUS, VW - BALL_RADIUS), -BALL_RADIUS),
      ]);
      const equation = k.add([
        k.text(problem.text, { size: 20 }),
        k.color(255, 255, 255),
        k.area(),
        k.anchor("center"),
        k.scale(1),
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
            if (isPaused) return;
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
        if (isPaused || isGameOver || !activeProblems.has(id)) return;
        selectedProblemId = id;
        selectedChoiceIndex = 0;
        showChoices();
      };
      ball.onClick(selectThisBalloon);
      equation.onClick(selectThisBalloon);

      if (selectedProblemId === null) selectedProblemId = id;
      showChoices();

      ball.onUpdate(() => {
        if (isPaused || isGameOver || !activeProblems.has(id)) return;
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
      nextBallIn = Math.max(1.6, 3.4 - (currentLevel - 1) * 0.35);
    }

    k.onUpdate(() => {
      if (isPaused || isGameOver || nextBallIn <= 0) return;
      nextBallIn -= k.dt();
      if (nextBallIn <= 0) {
        spawnBall();
        scheduleNextBall();
      }
    });

    spawnBall();
    scheduleNextBall();
  });

  k.scene("over", (finalScore: number) => {
    togglePause = () => {};
    k.add([k.text("Game Over", { size: 40 }), k.anchor("center"), k.pos(VW / 2, VH / 2 - 30), k.color(255, 255, 255)]);
    k.add([k.text(`Score: ${finalScore}`, { size: 24 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 16), k.color(16, 185, 129)]);
    k.add([k.text("tap or press Enter to play again", { size: 16 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 56), k.color(160, 160, 160)]);
    k.onMousePress(() => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.go("menu");
  return () => {
    handleCanvasAnswer = null;
    canvas.removeEventListener("pointerdown", handleCanvasPointerDown);
    k.quit();
  };
}