const UndoRedo = (function() {
  let stack = [];
  let index = -1;
  let onChange = null;
  const MAX_HISTORY = 50; // Cap to prevent memory leaks

  function capture(state) {
    const serialized = JSON.stringify(state);
    
    // Optimization: Don't capture if state hasn't changed from current
    if (index >= 0 && stack[index] === serialized) return;

    // Drop forward history
    if (index < stack.length - 1) {
      stack = stack.slice(0, index + 1);
    }

    stack.push(serialized);
    
    // Enforce history limit
    if (stack.length > MAX_HISTORY) {
      stack.shift();
    } else {
      index++;
    }
    
    emit();
  }

  function undo() {
    if (index > 0) {
      index--;
      emit();
      return JSON.parse(stack[index]);
    }
    return null;
  }

  function redo() {
    if (index < stack.length - 1) {
      index++;
      emit();
      return JSON.parse(stack[index]);
    }
    return null;
  }

  function canUndo() { return index > 0; }
  function canRedo() { return index < stack.length - 1; }

  function clear() {
    stack = [];
    index = -1;
    emit();
  }

  function onChangeSet(fn) { onChange = fn; }

  function emit() {
    if (onChange) {
      onChange({
        index,
        size: stack.length,
        canUndo: canUndo(),
        canRedo: canRedo()
      });
    }
  }

  return { capture, undo, redo, clear, onChangeSet, canUndo, canRedo };
})();
