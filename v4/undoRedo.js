// Simple undo/redo stack for MGSS Studio v4
// Uses full-scene snapshots for simplicity (ok for typical SVG sizes).
// If you prefer diff-based later, we can switch.

const UndoRedo = (function(){
  const stack = [];
  let index = -1;
  let onChange = null;

  function capture(state) {
    // drop forward history if new action
    if(index < stack.length - 1) stack.splice(index + 1);
    stack.push(JSON.stringify(state));
    index = stack.length - 1;
    emit();
  }
  function undo() {
    if(index > 0) {
      index--;
      emit();
      return JSON.parse(stack[index]);
    }
    return null;
  }
  function redo() {
    if(index < stack.length - 1) {
      index++;
      emit();
      return JSON.parse(stack[index]);
    }
    return null;
  }
  function getCurrent() {
    if(index >= 0) return JSON.parse(stack[index]);
    return null;
  }
  function clear() {
    stack.length = 0; index = -1; emit();
  }
  function onChangeSet(fn) { onChange = fn; }

  function emit(){ if(onChange) onChange({index, size:stack.length}); }

  return { capture, undo, redo, getCurrent, clear, onChangeSet };
})();
