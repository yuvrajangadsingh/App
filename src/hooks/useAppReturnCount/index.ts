import Visibility from '@libs/Visibility';

import {useEffect, useState} from 'react';

/**
 * Counts returns to the app. On web that is the browser tab becoming visible again, or the window getting focus back
 * from another desktop app, which leaves the tab visible and fires no visibilitychange.
 */
function useAppReturnCount(): number {
    const [returnCount, setReturnCount] = useState(0);

    useEffect(() => {
        // A tab switch fires blur, hidden, visible, focus. It is counted on visible, so the focus after it is skipped.
        let wasHiddenSinceBlur = false;
        const countReturn = () => setReturnCount((count) => count + 1);
        const stopVisibilityListener = Visibility.onVisibilityChange(() => {
            if (!Visibility.isVisible()) {
                wasHiddenSinceBlur = true;
                return;
            }
            countReturn();
        });
        const onBlur = () => {
            wasHiddenSinceBlur = false;
        };
        const onFocus = () => {
            if (wasHiddenSinceBlur) {
                return;
            }
            countReturn();
        };
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);

        return () => {
            stopVisibilityListener();
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    return returnCount;
}

export default useAppReturnCount;
