import kaplay from "kaplay";

// Select a falling math balloon and answer with a choice circle or arrow key.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const BALLOON_GROUND_Y = VH - 170;
const MAX_LIVES = 3;
const MAX_ACTIVE_BALLOONS = 3;
const BALLOON_SPAWN_INTERVAL = 2.5;
const QUESTIONS_PER_LEVEL = 7;
const MAX_LEVEL = 5;
const BALLOON_LANES = [VW * 0.2, VW * 0.5, VW * 0.8];

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  // Keep the game canvas focusable for keyboard play in desktop browsers.
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;

  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [24, 24, 27],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });
  let cleanupKeyboardInput: () => void = () => {};

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

    playBtn.onClick(() => {
      canvas.focus();
      k.go("play");
    });
  });

  k.scene("play", () => {
    let score = 0;
    let lives = MAX_LIVES;
    let nextProblemId = 0;
    let currentProblemId: number | null = null;
    let pausedProblemId: number | null = null;
    let answerSubmissionLocked = false;
    let levelTransitionPaused = false;
    let ignoreResumeBallClick = false;
    let currentLevel = 1;
    let keyboardAttached = false;
    const levelTransitionObjects: { destroy: () => void }[] = [];
    const activeProblems = new Map<
      number,
      {
        answer: number;
        hint: string;
        choices: number[];
        lane: number;
        outline: ReturnType<typeof k.outline>;
        pop: () => void;
      }
    >();
    const choiceObjects: { destroy: () => void }[] = [];
    onScore(0);

    const scoreLabel = k.add([
      k.text("Score: 0", { size: 18 }),
      k.color(255, 255, 255),
      k.pos(16, 16),
    ]);
    const levelLabel = k.add([
      k.text(`Level 1: 0/${QUESTIONS_PER_LEVEL}`, { size: 16 }),
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
      k.text("Click a balloon to pause it, then choose an answer.", { size: 14 }),
      k.color(190, 195, 210),
      k.anchor("center"),
      k.pos(VW / 2, VH - 87),
    ]);
    k.add([k.rect(VW, 2), k.color(100, 100, 110), k.pos(0, BALLOON_GROUND_Y)]);

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
      const nextLevel = getLevelForScore(score);
      if (nextLevel > currentLevel) {
        currentLevel = nextLevel;
        levelTransitionPaused = true;
        currentProblemId = null;
        pausedProblemId = null;
        clearChoices();
        removeKeyboardInput();
        levelTransitionObjects.push(
          k.add([
            k.rect(300, 112, { radius: 12 }),
            k.color(39, 39, 45),
            k.anchor("center"),
            k.pos(VW / 2, VH / 2),
          ]),
          k.add([
            k.text(`Level ${currentLevel}`, { size: 30 }),
            k.color(255, 255, 255),
            k.anchor("center"),
            k.pos(VW / 2, VH / 2 - 18),
          ]),
          k.add([
            k.text("Click or press Space to continue", { size: 14 }),
            k.color(190, 195, 210),
            k.anchor("center"),
            k.pos(VW / 2, VH / 2 + 22),
          ]),
        );
      }
      const questionsInLevel =
        currentLevel === MAX_LEVEL && score >= MAX_LEVEL * QUESTIONS_PER_LEVEL
          ? QUESTIONS_PER_LEVEL
          : score % QUESTIONS_PER_LEVEL;
      levelLabel.text = `Level ${currentLevel}: ${questionsInLevel}/${QUESTIONS_PER_LEVEL}`;
    }

    function makeProblem(level: number): { text: string; answer: number; hint: string } {
      const additionChance = level < 2 ? 0.75 : 0.5;
      const maxValue = 4 + level * 2;
      const smallMax = Math.min(5 + level, 9);
      const first = Math.floor(k.rand(1, maxValue + 1));
      const second = Math.floor(k.rand(1, smallMax + 1));

      if (k.rand(0, 1) < additionChance) {
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

    function selectProblem(id: number, pauseForAnswer = false): void {
      if (lives <= 0 || levelTransitionPaused) return;
      const problem = activeProblems.get(id);
      if (!problem) return;

      currentProblemId = id;
      if (pauseForAnswer) pausedProblemId = id;
      activeProblems.forEach((active, activeId) => {
        active.outline.outline.width = activeId === id ? 5 : 2;
      });
      hintLabel.text = problem.hint;
      feedbackLabel.text = pauseForAnswer
        ? "Paused — click a circle or use ← ↓ →."
        : "Click a circle or use ← ↓ → to answer.";
      feedbackLabel.color = k.rgb(190, 195, 210);
      showChoices(problem.choices, id);
      if (!keyboardAttached) {
        window.addEventListener("keydown", handleKeyDown);
        keyboardAttached = true;
      }
    }

    function resumeLevelTransition(fromMouse: boolean): void {
      if (!levelTransitionPaused) return;
      levelTransitionPaused = false;
      for (const object of levelTransitionObjects) object.destroy();
      levelTransitionObjects.length = 0;
      if (fromMouse) {
        ignoreResumeBallClick = true;
        k.wait(0.3, () => {
          ignoreResumeBallClick = false;
        });
      }

      const nextId = Array.from(activeProblems.keys()).pop();
      if (nextId === undefined) {
        spawnBall();
      } else {
        selectProblem(nextId);
      }
    }

    function removeKeyboardInput(): void {
      if (!keyboardAttached) return;
      window.removeEventListener("keydown", handleKeyDown);
      keyboardAttached = false;
    }
    cleanupKeyboardInput = removeKeyboardInput;

    function loseLife(message: string): void {
      lives -= 1;
      heartsLabel.text = `${"♥ ".repeat(lives)}${"♡ ".repeat(MAX_LIVES - lives)}`.trim();
      feedbackLabel.text = message;
      feedbackLabel.color = k.rgb(248, 72, 99);

      if (lives <= 0) {
        currentProblemId = null;
        clearChoices();
        removeKeyboardInput();
        k.wait(0.65, () => k.go("over", score));
      }
    }

    function submitChoice(choice: number, id: number): void {
      const problem = activeProblems.get(id);
      if (answerSubmissionLocked || !problem || !problem.choices.includes(choice)) return;

      answerSubmissionLocked = true;
      problem.pop();
      if (choice === problem.answer) {
        score += 1;
        updateLevel();
        scoreLabel.text = `Score: ${score}`;
        onScore(score);
        feedbackLabel.text = "POP! Great job!";
        feedbackLabel.color = k.rgb(34, 197, 94);
      } else {
        loseLife("Wrong answer — the balloon popped!");
      }
      if (lives > 0) {
        k.wait(0.2, () => {
          answerSubmissionLocked = false;
          spawnBall();
        });
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (currentProblemId === null) return;

      const id = currentProblemId;
      const problem = activeProblems.get(id);
      if (!problem) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        const index = event.key === "ArrowLeft" ? 0 : event.key === "ArrowDown" ? 1 : 2;
        const choice = problem.choices[index];
        if (choice !== undefined) submitChoice(choice, id);
        return;
      }
    }

    function showChoices(choices: number[], id: number): void {
      clearChoices();
      const choiceRadius = 32;
      const gap = 48;
      const totalWidth = choiceRadius * 2 * choices.length + gap * (choices.length - 1);
      const startX = (VW - totalWidth) / 2 + choiceRadius;

      choices.forEach((choice, index) => {
        const x = startX + index * (choiceRadius * 2 + gap);
        const color = ballColors[index % ballColors.length] ?? k.rgb(255, 255, 255);
        const button = k.add([
          k.circle(choiceRadius),
          k.color(color),
          k.area(),
          k.anchor("center"),
          k.pos(x, VH - 42),
          k.outline(2, k.rgb(255, 255, 255)),
        ]);
        const label = k.add([
          k.text(String(choice), { size: 22 }),
          k.color(255, 255, 255),
          k.anchor("center"),
          k.pos(x, VH - 42),
          k.area(),
        ]);
        const answerIt = () => submitChoice(choice, id);
        button.onClick(answerIt);
        label.onClick(answerIt);
        choiceObjects.push(button, label);
      });
    }

    function spawnBall(): void {
      if (activeProblems.size >= MAX_ACTIVE_BALLOONS || lives <= 0 || levelTransitionPaused) return;
      updateLevel();
      const problem = makeProblem(currentLevel);
      const id = nextProblemId++;
      const occupiedLanes = new Set(Array.from(activeProblems.values(), (active) => active.lane));
      const lane = BALLOON_LANES.findIndex((_, index) => !occupiedLanes.has(index));
      const laneX = BALLOON_LANES[lane];
      if (laneX === undefined) return;
      const outline = k.outline(2, k.rgb(255, 255, 255));
      const ball = k.add([
        k.circle(BALL_RADIUS),
        k.color(k.choose(ballColors)),
        k.area(),
        k.anchor("center"),
        k.pos(laneX, -BALL_RADIUS),
        k.scale(1),
        outline,
      ]);
      const equation = k.add([
        k.text(problem.text, { size: 20 }),
        k.color(255, 255, 255),
        k.anchor("center"),
        k.pos(ball.pos.x, ball.pos.y),
        k.scale(1),
      ]);

      activeProblems.set(id, {
        answer: problem.answer,
        hint: problem.hint,
        choices: makeChoices(problem.answer, currentLevel),
        lane,
        outline,
        pop: () => {
          if (!activeProblems.has(id)) return;
          activeProblems.delete(id);
          if (pausedProblemId === id) pausedProblemId = null;
          if (currentProblemId === id) {
            currentProblemId = null;
            const nextId = Array.from(activeProblems.keys()).pop();
            if (nextId === undefined) {
              clearChoices();
              removeKeyboardInput();
            } else {
              selectProblem(nextId);
            }
          }
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

      ball.onClick(() => {
        if (!ignoreResumeBallClick) selectProblem(id, true);
      });
      if (currentProblemId === null) selectProblem(id);

      ball.onUpdate(() => {
        if (
          !activeProblems.has(id) ||
          lives <= 0 ||
          levelTransitionPaused ||
          pausedProblemId === id
        ) return;

        const fallSpeed = 45 + (currentLevel - 1) * 15;
        ball.pos.y = Math.min(
          BALLOON_GROUND_Y - BALL_RADIUS,
          ball.pos.y + fallSpeed * k.dt(),
        );
        equation.pos = ball.pos;
        if (ball.pos.y + BALL_RADIUS >= BALLOON_GROUND_Y) {
          activeProblems.get(id)?.pop();
          loseLife("Missed balloon! One life lost.");
          if (lives > 0) spawnBall();
        }
      });
    }

    function keepBalloonsComing(): void {
      if (lives <= 0) return;
      if (!levelTransitionPaused) spawnBall();
      k.wait(BALLOON_SPAWN_INTERVAL, keepBalloonsComing);
    }

    k.onMousePress(() => resumeLevelTransition(true));
    k.onKeyPress("space", () => resumeLevelTransition(false));
    spawnBall();
    k.wait(BALLOON_SPAWN_INTERVAL, keepBalloonsComing);
  });

  k.scene("over", (finalScore: number) => {
    k.add([k.text("Game Over", { size: 40 }), k.anchor("center"), k.pos(VW / 2, VH / 2 - 30), k.color(255, 255, 255)]);
    k.add([k.text(`Score: ${finalScore}`, { size: 24 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 16), k.color(16, 185, 129)]);
    k.add([k.text("tap or press Space to play again", { size: 16 }), k.anchor("center"), k.pos(VW / 2, VH / 2 + 56), k.color(160, 160, 160)]);
    k.onMousePress(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
  });

  k.go("menu");
  return () => {
    cleanupKeyboardInput();
    k.quit();
  };
}