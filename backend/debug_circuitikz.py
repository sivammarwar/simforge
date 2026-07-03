import os
import subprocess
import tempfile

# Match whatever schematic.py currently sets TEXINPUTS to
circuitikz_path = '/usr/local/texlive/2026basic/texmf-dist/tex/latex/circuitikz'
os.environ['TEXINPUTS'] = f"{circuitikz_path}:" + os.environ.get('TEXINPUTS', '')

print("PDFLATEX resolved to:", subprocess.run(['which', 'pdflatex'], capture_output=True, text=True).stdout.strip())
print("PDFLATEX version:", subprocess.run(['pdflatex', '--version'], capture_output=True, text=True).stdout.splitlines()[0])
print("TEXINPUTS:", os.environ['TEXINPUTS'])
print("kpsewhich result:", subprocess.run(['kpsewhich', 'circuitikz.sty'], capture_output=True, text=True).stdout.strip() or "(not found)")

tex_content = r"""\documentclass[a4paper]{standalone}
\usepackage{circuitikz}
\begin{document}
\end{document}"""

with tempfile.TemporaryDirectory() as d:
    tex_path = os.path.join(d, "test.tex")
    with open(tex_path, "w") as f:
        f.write(tex_content)
    result = subprocess.run(
        ['pdflatex', '-interaction', 'batchmode', 'test.tex'],
        cwd=d, capture_output=True, text=True
    )
    print("Return code:", result.returncode)
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    log_path = os.path.join(d, "test.log")
    with open(log_path, errors="replace") as f:
        log = f.read()
    # Print the part of the log around any error
    if "!" in log:
        idx = log.index("!")
        print("---- LOG ERROR CONTEXT ----")
        print(log[max(0, idx-200):idx+1000])
    else:
        print("---- Package lines in log ----")
        for line in log.splitlines():
            if "circuitikz" in line.lower() or "Package:" in line:
                print(line)
