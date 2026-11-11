import kaplay from "kaplay";

// Solve each math balloon by tapping an answer while it falls from the top.
const VW = 400;
const VH = 600;
const BALL_RADIUS = 38;
const BALL_STOP_Y = VH - 170;
const MAX_LIVES = 3;

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
      k.go("play");
    });
  });

  k.scene("play", () => {
    let score = 0;
    let lives = MAX_LIVES;
    let nextProblemId = 0;
    let currentProblemId: number | null = null;
    let currentLevel = 1;
    const activeProblems = new Map<number, { answer: number; pop: () => void }>();
    const choiceObjects: { destroy: () => void }[] = [];
    let currentChoices: number[] = [];
    let selectedChoice = 1;
    let typedAnswer = "";
    let answerButtons: any[] = [];
    onScore(0);

    const scoreLabel = k.add([
      k.text("Score: 0", { size: 18 }),
      k.color(255, 255, 255),
      k.pos(16, 16),
    ]);
    const levelLabel = k.add([
      k.text("Level 1", { size: 16 }),
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
      k.text("Choose an answer to pop the balloon!", { size: 14 }),
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

    function getLevelForScore(currentScore: number): number {
      return Math.min(5, 1 + Math.floor(currentScore / 3));
    }

    function updateLevel(): void {
      currentLevel = getLevelForScore(score);
      levelLabel.text = `Level ${currentLevel}`;
    }

    function makeProblem(level: number): { text: string; answer: number; hint: string } {
      const additionChance = level < 2 ? 0.75 : 0.5;
      const maxValue = 4 + level * 2;
      const smallMax = Math.min(5 + level, 9);
      const first = Math.floor(k.rand(1, maxValue + 1));
      const second = Math.floor(k.rand(1, smallMax + 1));

      if (k.rand() < additionChance) {
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
        const candidate = Math.max(0, answer + (k.rand() < 0.5 ? -offset : offset));
        choices.add(candidate);
      }
      return k.shuffle(Array.from(choices));
    }

    function setSelectedChoice(index: number): void {
      selectedChoice = index;
      answerButtons.forEach((button, buttonIndex) => {
        button.outline = {
          color: k.rgb(255, 255, 255),
          width: buttonIndex === selectedChoice ? 5 : 2,
        };
      });
    }

    function clearChoices(): void {
      for (const object of choiceObjects) object.destroy();
      choiceObjects.length = 0;
      currentChoices = [];
      answerButtons = [];
      selectedChoice = -1;
      typedAnswer = "";
    }

    function submitChoice(index: number, id: number): void {
      const problem = activeProblems.get(id);
      const choice = currentChoices[index];
      if (!problem || choice === undefined) return;

      // A click or arrow-key choice resolves the round immediately.
      problem.pop();
      if (choice === problem.answer) {
        score += 1;
        updateLevel();
        scoreLabel.text = `Score: ${score}`;
        onScore(score);
        feedbackLabel.text = "POP! Great job!";
        feedbackLabel.color = k.rgb(34, 197, 94);
      } else {
        lives -= 1;
        heartsLabel.text = `${"♥ ".repeat(lives)}${"♡ ".repeat(MAX_LIVES - lives)}`.trim();
        feedbackLabel.text = "Wrong answer — the balloon popped!";
        feedbackLabel.color = k.rgb(248, 72, 99);
      }

      if (lives <= 0) {
        k.wait(0.65, () => k.go("over", score));
      } else {
        k.wait(0.65, spawnBall);
      }
    }

    function chooseWithArrow(index: number): void {
      if (currentProblemId !== null) submitChoice(index, currentProblemId);
    }

    k.onKeyPress("left", () => chooseWithArrow(0));
    k.onKeyPress("down", () => chooseWithArrow(1));
    k.onKeyPress("right", () => chooseWithArrow(2));

    for (let digit = 0; digit <= 9; digit += 1) {
      k.onKeyPress(String(digit), () => {
        if (currentProblemId === null) return;

        const id = currentProblemId;
        const problem = activeProblems.get(id);
        if (!problem) return;

        typedAnswer += String(digit);
        const matchingChoice = currentChoices.indexOf(Number(typedAnswer));
        setSelectedChoice(matchingChoice);
        feedbackLabel.text = `Your answer: ${typedAnswer} (Backspace to edit)`;

        // Keep incorrect typed answers editable; the correct number pops the balloon.
        if (matchingChoice >= 0 && Number(typedAnswer) === problem.answer) {
          k.wait(0.2, () => submitChoice(matchingChoice, id));
        }
      });
    }

    k.onKeyPress("backspace", () => {
      if (currentProblemId === null || typedAnswer.length === 0) return;
      typedAnswer = typedAnswer.slice(0, -1);
      const matchingChoice = currentChoices.indexOf(Number(typedAnswer));
      setSelectedChoice(typedAnswer.length > 0 ? matchingChoice : -1);
      feedbackLabel.text = typedAnswer
        ? `Your answer: ${typedAnswer} (Backspace to edit)`
        : "Type the answer, or use ← ↓ → to choose.";
    });

    function showChoices(answer: number, id: number): void {
      clearChoices();
      const choices = makeChoices(answer, currentLevel);
      currentChoices = choices;
      selectedChoice = Math.min(1, choices.length - 1);
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
        answerButtons.push(button);
        button.outline = {
          color: k.rgb(255, 255, 255),
          width: index === selectedChoice ? 5 : 2,
        };
        const label = k.add([
          k.text(String(choice), { size: 22 }),
          k.color(255, 255, 255),
          k.anchor("center"),
          k.pos(x, VH - 42),
        ]);
        button.onClick(() => submitChoice(index, id));
        choiceObjects.push(button, label);
      });
    }

    function spawnBall(): void {
      updateLevel();
      const problem = makeProblem(currentLevel);
      const id = nextProblemId++;
      currentProblemId = id;
      const fallSpeed = 90 + currentLevel * 18;
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

      activeProblems.set(id, {
        answer: problem.answer,
        pop: () => {
          if (!activeProblems.has(id)) return;
          activeProblems.delete(id);
          if (currentProblemId === id) currentProblemId = null;
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
      feedbackLabel.text = "Type the answer, or use ← ↓ → to choose.";
      feedbackLabel.color = k.rgb(190, 195, 210);
      showChoices(problem.answer, id);

      ball.onUpdate(() => {
        // Let the balloon fall from the top, then hold it above the answer buttons.
        ball.pos.y = Math.min(BALL_STOP_Y, ball.pos.y + fallSpeed * k.dt());
        equation.pos = ball.pos;
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

  k.go("menu");
  return () => k.quit();
}
