# Boot display

`BootRenderer` emits the original ANSI boot screen, including full and mobile logo crops, panel placement, true colours, progress and four spinner frames. It accepts terminal size and real boot milestones; ticks update only the spinner cell. Start and finish preserve the alternate-screen and cursor sequences. The regression fixture records 120 original renderer outputs.
