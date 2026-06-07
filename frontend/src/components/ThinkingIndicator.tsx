import { IconLoader2 } from '@tabler/icons-react';

import { formatElapsedSeconds } from '../hooks/useElapsedSeconds';



interface ThinkingIndicatorProps {

  seconds?: number;

}



/** 品牌紫蓝轻强调：左侧色条 + 淡紫底，进行中有微弱呼吸光晕 */

export function ThinkingIndicatorShell({

  children,

  className = '',

}: {

  children: React.ReactNode;

  className?: string;

}) {

  return (

    <div

      className={`fc-process-active min-w-0 w-full rounded-2xl rounded-tl-sm border border-violet-500/30 bg-violet-500/[0.07] px-4 py-3.5 border-l-[3px] border-l-violet-500/70 ${className}`}

    >

      {children}

    </div>

  );

}



export function ThinkingIndicator({ seconds }: ThinkingIndicatorProps) {

  return (

    <div className="flex min-w-0 flex-1 items-center gap-2">

      <IconLoader2

        className="size-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400"

        stroke={2}

        aria-hidden

      />

      <span className="text-sm font-medium text-violet-700 dark:text-violet-300">努力工作中</span>

      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>

        {[0, 0.2, 0.4].map((delay) => (

          <span

            key={delay}

            className="fc-typing-dot inline-block size-1 rounded-full bg-violet-500/55"

            style={{ animationDelay: `${delay}s` }}

          />

        ))}

      </span>

      {seconds !== undefined && (

        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-violet-600/75 dark:text-violet-400/75">

          {formatElapsedSeconds(seconds)}

        </span>

      )}

    </div>

  );

}

