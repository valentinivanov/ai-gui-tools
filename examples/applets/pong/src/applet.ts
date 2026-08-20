// AssemblyScript PoC applet for the AgentUI WASM host ABI.

@external("agentui", "clear")
declare function clear(rgba: u32): void;

@external("agentui", "draw_rect")
declare function drawRect(x: f64, y: f64, width: f64, height: f64, rgba: u32): void;

@external("agentui", "draw_circle")
declare function drawCircle(x: f64, y: f64, radius: f64, rgba: u32): void;

@external("agentui", "draw_text")
declare function drawText(ptr: usize, len: i32, x: f64, y: f64, size: f64, rgba: u32): void;

@external("agentui", "emit_event")
declare function emitEvent(ptr: usize, len: i32): void;

const WHITE: u32 = 0xffffffff;
const GREEN: u32 = 0x22c55eff;
const RED: u32 = 0xef4444ff;
const DARK: u32 = 0x0f172aff;

let width = 640.0;
let height = 360.0;
let paddleX = 280.0;
let ballX = 320.0;
let ballY = 180.0;
let ballVX = 170.0;
let ballVY = -150.0;
let score = 0;
let leftDown = false;
let rightDown = false;
let started = false;
let finished = false;

export function init(nextWidth: f64, nextHeight: f64): void {
  resize(nextWidth, nextHeight);
  reset();
}

export function resize(nextWidth: f64, nextHeight: f64): void {
  width = nextWidth;
  height = nextHeight;
}

export function update(deltaMs: f64): void {
  const dt = minF64(deltaMs / 1000.0, 0.05);
  if (started && !finished) {
    if (leftDown) paddleX -= 360.0 * dt;
    if (rightDown) paddleX += 360.0 * dt;
    paddleX = clampF64(paddleX, 0.0, width - 96.0);

    ballX += ballVX * dt;
    ballY += ballVY * dt;

    if (ballX < 10.0 || ballX > width - 10.0) ballVX = -ballVX;
    if (ballY < 10.0) ballVY = absF64(ballVY);

    const paddleY = height - 36.0;
    if (ballY >= paddleY - 10.0 && ballY <= paddleY + 12.0 && ballX >= paddleX && ballX <= paddleX + 96.0 && ballVY > 0.0) {
      ballVY = -absF64(ballVY) - 8.0;
      ballVX += (ballX - (paddleX + 48.0)) * 3.0;
      score += 1;
    }

    if (ballY > height + 20.0) {
      finished = true;
      emitJson("{\"type\":\"game_over\",\"payload\":{\"score\":" + score.toString() + "}}");
    }
  }

  render();
}

export function key_event(kind: i32, code: i32, repeat: i32): void {
  const isDown = kind == 1;
  if (code == 65 || code == 37) leftDown = isDown;
  if (code == 68 || code == 39) rightDown = isDown;
  if (isDown && !started && code == 83) startGame();
  if (isDown && code == 82) startGame();
  if (isDown && !started && code == 69) emitJson("{\"type\":\"exit\",\"payload\":{\"reason\":\"title\"}}");
  if (isDown && finished && code == 69) emitJson("{\"type\":\"exit\",\"payload\":{\"reason\":\"game_over\"}}");
}

export function pointer_event(kind: i32, pointerId: i32, x: f64, y: f64, button: i32): void {
  paddleX = clampF64(x - 48.0, 0.0, width - 96.0);
}

export function destroy(): void {
  finished = true;
}

function reset(): void {
  paddleX = width / 2.0 - 48.0;
  ballX = width / 2.0;
  ballY = height / 2.0;
  ballVX = 170.0;
  ballVY = -150.0;
  score = 0;
  started = false;
  finished = false;
}

function startGame(): void {
  paddleX = width / 2.0 - 48.0;
  ballX = width / 2.0;
  ballY = height / 2.0;
  ballVX = 170.0;
  ballVY = -150.0;
  score = 0;
  started = true;
  finished = false;
}

function render(): void {
  clear(DARK);
  if (!started) {
    drawTextUtf8("PONG", width / 2.0 - 82.0, height / 2.0 - 72.0, 48.0, GREEN);
    drawTextUtf8("Score points by returning the ball", width / 2.0 - 132.0, height / 2.0 - 26.0, 16.0, WHITE);
    drawTextUtf8("Press S for start", width / 2.0 - 66.0, height / 2.0 + 12.0, 16.0, WHITE);
    drawTextUtf8("Press E for exit", width / 2.0 - 60.0, height / 2.0 + 38.0, 16.0, WHITE);
  } else if (finished) {
    drawTextUtf8("Score " + score.toString(), 18.0, 28.0, 18.0, WHITE);
    drawTextUtf8("GAME OVER", width / 2.0 - 62.0, height / 2.0 - 14.0, 22.0, RED);
    drawTextUtf8("Press R to restart", width / 2.0 - 70.0, height / 2.0 + 16.0, 16.0, WHITE);
    drawTextUtf8("Press E to exit", width / 2.0 - 58.0, height / 2.0 + 40.0, 16.0, WHITE);
  } else {
    drawRect(paddleX, height - 30.0, 96.0, 12.0, GREEN);
    drawTextUtf8("Score " + score.toString(), 18.0, 28.0, 18.0, WHITE);
    drawCircle(ballX, ballY, 8.0, WHITE);
  }
}

function drawTextUtf8(value: string, x: f64, y: f64, size: f64, rgba: u32): void {
  const data = String.UTF8.encode(value, false);
  drawText(changetype<usize>(data), data.byteLength, x, y, size, rgba);
}

function emitJson(value: string): void {
  const data = String.UTF8.encode(value, false);
  emitEvent(changetype<usize>(data), data.byteLength);
}

function minF64(left: f64, right: f64): f64 {
  return left < right ? left : right;
}

function absF64(value: f64): f64 {
  return value < 0.0 ? -value : value;
}

function clampF64(value: f64, min: f64, max: f64): f64 {
  return value < min ? min : value > max ? max : value;
}
