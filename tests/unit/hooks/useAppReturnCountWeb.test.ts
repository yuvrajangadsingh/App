import {act, renderHook} from '@testing-library/react-native';

import useAppReturnCount from '@hooks/useAppReturnCount';
import type * as UseAppReturnCountModule from '@hooks/useAppReturnCount/index.ts';

let mockIsVisible = true;
let mockOnVisibilityChange: (() => void) | undefined;

jest.mock('@hooks/useAppReturnCount', () => jest.requireActual<typeof UseAppReturnCountModule>('@hooks/useAppReturnCount/index.ts'));

jest.mock('@libs/Visibility', () => ({
    __esModule: true,
    default: {
        isVisible: () => mockIsVisible,
        onVisibilityChange: (callback: () => void) => {
            mockOnVisibilityChange = callback;
            return () => {};
        },
    },
}));

function setTabVisible(isVisible: boolean) {
    mockIsVisible = isVisible;
    act(() => mockOnVisibilityChange?.());
}

function emitWindowEvent(type: 'blur' | 'focus') {
    act(() => {
        window.dispatchEvent(new Event(type));
    });
}

describe('useAppReturnCount on web', () => {
    beforeEach(() => {
        mockIsVisible = true;
    });

    it('counts a return from another browser tab once', () => {
        // Given a mounted hook
        const {result} = renderHook(() => useAppReturnCount());

        // When the user switches to another tab and back, which hides the page in between
        emitWindowEvent('blur');
        setTabVisible(false);
        setTabVisible(true);
        emitWindowEvent('focus');

        // Then it is one return, not one for the visibility change and another for the focus
        expect(result.current).toBe(1);
    });

    it('counts a return from another app that left the tab visible', () => {
        // Given a mounted hook
        const {result} = renderHook(() => useAppReturnCount());

        // When the user switches to another desktop app and back, which only blurs and focuses the window
        emitWindowEvent('blur');
        emitWindowEvent('focus');

        // Then that is a return too, so Home refreshes like it does after a tab switch
        expect(result.current).toBe(1);
    });
});
