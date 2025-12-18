// Save / Load project (.mgss.json)
const ProjectIO = (function(){
  function exportProject(state) {
    // state is a plain object representing the app (regions, background, canvas size)
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mgss_project.mgss.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function importProjectFile(file, cb) {
    const reader = new FileReader();
    reader.onload = function(e){ 
      try {
        const obj = JSON.parse(e.target.result);
        cb(null, obj);
      } catch(err){ cb(err); }
    };
    reader.onerror = function(){ cb(new Error('Failed to read file')); };
    reader.readAsText(file);
  }

  return { exportProject, importProjectFile };
})();
