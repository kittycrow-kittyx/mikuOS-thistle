import { LOGO_ROWS, LOGO_FULL_COLS, LOGO_ICON_COLS, logo_full_rows, logo_icon_rows } from "./logo.js";
const labels = ["Loading mikuOS runtime", "Preparing browser runtime", "Reading guest filesystem index", "Unpacking guest filesystem", "Restoring persistent changes", "Initialising execution kernel", "Initialising userland", "Preparing interactive shell", "Starting mikuOS session"];
const spin = ["|", "/", "-", "\\"];
const colours = ["0;0;0", "0;106;129", "0;148;166", "45;206;210"];
const integer = Math.trunc;
/** Emits the same terminal byte stream as the original boot renderer. */
export class BootRenderer {
  private cols = 60; private rows = 24; private stage = 0; private loaded = 0; private total = 0; private frame = 0; private started = false;
  private spinnerX = 1; private spinnerY = 1; private screen = "";
  constructor(private readonly emit: (text: string) => void) {}
  private put(s: string): void { this.screen += s; }
  private move(x: number, y: number): void { this.put(`\x1b[${Math.max(0,y)};${Math.max(0,x)}H`); }
  private fg(i: number): void { this.put(`\x1b[38;2;${colours[i] ?? ""}m`); }
  private bg(i: number): void { this.put(`\x1b[48;2;${colours[i] ?? ""}m`); }
  private reset(): void { this.put("\x1b[0m"); }
  private centre(s: string, y: number, w: number, x: number): void { this.move(x+Math.max(0,integer((w-s.length)/2)),y);this.put(s); }
  private art(x: number,y: number,w: number,available: number): void {
    const full=w>=LOGO_FULL_COLS+4, count=full?LOGO_FULL_COLS:LOGO_ICON_COLS, img=full?logo_full_rows:logo_icon_rows;
    if(w<count+4||available<=0)return;
    const x0=x+integer((w-count)/2), n=Math.min(available,LOGO_ROWS), from=integer((LOGO_ROWS-n)/2);
    for(let k=0;k<n;k++){this.move(x0,y+k);this.put(img[from+k]??"");}
  }
  private draw(): void {
    if(!this.started)return;
    this.screen="";this.put("\x1b[H\x1b[2J\x1b[?25l");const width=Math.min(this.cols-2,94);
    if(width<26){this.move(1,1);this.fg(3);this.put("mikuOS  ");this.spinnerX=9;this.spinnerY=1;this.put(spin[this.frame%4]??"");this.reset();this.move(1,2);this.put(labels[this.stage]??"");}
    else this.panel(width);
    this.emit(this.screen);
  }
  private panel(width: number): void {
      // Preserve C integer division, panel bounds and original cell positions.
      const x=integer((this.cols-width)/2)+1,h=Math.min(this.rows-2,22),top=Math.max(1,integer((this.rows-h)/2)+1);
      for(let py=0;py<h;py++){this.move(x,top+py);this.bg(0);this.fg(1);this.put("|"+" ".repeat(Math.max(0,width-2))+"|");this.reset();}
      this.fg(2);this.move(x,top);this.put("+"+"-".repeat(width-2)+"+");this.centre("Loading mikuOS",top+1,width,x);this.reset();
      if(width>=LOGO_ICON_COLS+4&&h>=18)this.art(x,top+3,width,h>=22?LOGO_ROWS:h-10);
      else{this.move(x+3,top+3);this.fg(3);this.put("mikuOS boot");this.reset();}
      const line=top+h-5;this.spinnerX=x+2;this.spinnerY=line;this.move(this.spinnerX,this.spinnerY);this.fg(3);this.put(spin[this.frame%4]??"");this.reset();this.put(" ");this.put((labels[this.stage]??"").slice(0,width-7));
      this.move(x+2,line+2);const n=width-4;
      let bp=integer(this.stage*100/8);if(this.total>0&&this.loaded>0)bp+=integer(this.loaded*100/(this.total*8));bp=Math.min(bp,100);
      this.fg(2);for(let j=0;j<n;j++)this.put(j*100<bp*n?"█":"░");this.reset();
      this.move(x,top+h-1);this.fg(2);this.put("+"+"-".repeat(width-2)+"+");this.reset();

  }
  start(width: number,height: number): void {this.cols=width>0?width:60;this.rows=height>0?height:24;this.stage=0;this.loaded=0;this.total=0;this.frame=0;this.started=true;this.emit("\x1b[?1049h\x1b[?25l");this.draw();}
  update(phase: number,done: number,size: number): void {if(phase<0||phase>8||phase<this.stage)return;this.stage=phase;this.loaded=Math.max(0,done);this.total=Math.max(0,size);this.draw();}
  tick(): void {if(!this.started)return;this.frame++;this.screen="";this.move(this.spinnerX,this.spinnerY);this.fg(3);this.put(spin[this.frame%4]??"");this.reset();this.emit(this.screen);}
  resize(width: number,height: number): void {this.cols=width>0?width:60;this.rows=height>0?height:24;this.draw();}
  finish(): void {if(!this.started)return;this.started=false;this.emit("\x1b[?1049l\x1b[?25h");}
}
