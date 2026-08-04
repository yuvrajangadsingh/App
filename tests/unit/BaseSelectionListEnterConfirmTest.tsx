import {fireEvent, render, screen} from '@testing-library/react-native';

import OnyxListItemProvider from '@components/OnyxListItemProvider';
import MultiSelectListItem from '@components/SelectionList/ListItem/MultiSelectListItem';
import BaseSelectionListWithSections from '@components/SelectionList/SelectionListWithSections/BaseSelectionListWithSections';
import type {ListItem, SelectionListWithSectionsProps} from '@components/SelectionList/SelectionListWithSections/types';

import type Navigation from '@libs/Navigation/Navigation';

import CONST from '@src/CONST';

import type ReactNative from 'react-native';

import * as NativeNavigation from '@react-navigation/native';
import React from 'react';

// Mock FlashList (same shape as BaseSelectionListSectionsTest)
jest.mock('@shopify/flash-list', () => {
    const ReactLocal = jest.requireActual<typeof React>('react');
    const RN = jest.requireActual<typeof ReactNative>('react-native');

    const FlashList = ReactLocal.forwardRef<
        {scrollToIndex: (params: {index: number}) => void},
        Omit<React.ComponentProps<typeof RN.ScrollView>, 'children'> & {
            data?: unknown[];
            renderItem?: (info: {item: unknown; index: number; target: string}) => React.ReactNode;
            keyExtractor?: (item: unknown, index: number) => string;
            ListHeaderComponent?: React.ReactNode;
            ListFooterComponent?: React.ReactNode;
        }
    >(({data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ...scrollViewProps}, ref) => {
        ReactLocal.useImperativeHandle(ref, () => ({scrollToIndex: jest.fn(), announceProgrammaticScroll: jest.fn()}));
        return ReactLocal.createElement(
            RN.ScrollView,
            scrollViewProps,
            ListHeaderComponent ?? null,
            ...(data ?? []).map((item, index) =>
                ReactLocal.createElement(ReactLocal.Fragment, {key: keyExtractor?.(item, index) ?? String(index)}, renderItem?.({item, index, target: 'Cell'})),
            ),
            ListFooterComponent ?? null,
        );
    });

    return {FlashList};
});

jest.mock('@src/components/ConfirmedRoute.tsx');
jest.mock('@react-navigation/native', () => {
    const actualNav = jest.requireActual<typeof Navigation>('@react-navigation/native');
    return {
        ...actualNav,
        useIsFocused: jest.fn(),
        useFocusEffect: jest.fn(),
        useNavigation: jest.fn(() => ({
            isFocused: jest.fn(() => true),
        })),
    };
});

jest.mock('@hooks/useLocalize', () =>
    jest.fn(() => ({
        translate: jest.fn((key: string) => key),
        numberFormat: jest.fn((num: number) => num.toString()),
    })),
);

jest.mock('@hooks/useKeyboardShortcut', () => jest.fn());

const memberSections = Array.from({length: 6}, (_, index) => ({
    text: `Member ${index}`,
    keyForList: `${index}`,
    isSelected: index === 1,
}));

describe('BaseSelectionListWithSections plain Enter vs confirm (issue #92803)', () => {
    const onSelectRowMock = jest.fn();
    const onConfirmMock = jest.fn();

    beforeEach(() => {
        onSelectRowMock.mockClear();
        onConfirmMock.mockClear();
        (NativeNavigation.useIsFocused as jest.Mock).mockReturnValue(true);
    });

    function InviteLikeList({searchText = '', initiallyFocusedItemKey}: {searchText?: string; initiallyFocusedItemKey?: string}) {
        const sections: SelectionListWithSectionsProps<ListItem>['sections'] = [{data: memberSections, sectionIndex: 0}];
        return (
            <OnyxListItemProvider>
                <BaseSelectionListWithSections
                    sections={sections}
                    textInputOptions={{
                        label: 'common.search',
                        onChangeText: jest.fn(),
                        value: searchText,
                    }}
                    ListItem={MultiSelectListItem}
                    onSelectRow={onSelectRowMock}
                    shouldSingleExecuteRowSelect
                    shouldShowTextInput
                    canSelectMultiple
                    shouldUpdateFocusedIndex
                    confirmButtonOptions={{onConfirm: onConfirmMock, text: 'Next'}}
                    initiallyFocusedItemKey={initiallyFocusedItemKey}
                />
            </OnyxListItemProvider>
        );
    }

    it('confirms on Enter after mouse-selecting members with an idle search (the reported bug)', () => {
        render(<InviteLikeList />);

        // Mouse-select a member: pins focusedIndex to the clicked row
        fireEvent.press(screen.getByTestId(`${CONST.BASE_LIST_ITEM_TEST_ID}3`));
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);

        // The user has the (empty) search box focused when they press Enter. Kept implementation-agnostic
        // so a fix that gates on the text input being focused is exercised on the same footing.
        fireEvent(screen.getByTestId('selection-list-text-input'), 'focusChange', true);
        // Enter in the empty search box should open Confirm Details (onConfirm), not toggle the clicked row
        fireEvent(screen.getByTestId('selection-list-text-input'), 'submitEditing');
        expect(onConfirmMock).toHaveBeenCalledTimes(1);
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);
    });

    it('still toggles the focused result on Enter when a query is typed (review regression case 1)', () => {
        render(
            <InviteLikeList
                searchText="Member"
                initiallyFocusedItemKey="2"
            />,
        );

        fireEvent(screen.getByTestId('selection-list-text-input'), 'submitEditing');
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);
        expect(onConfirmMock).not.toHaveBeenCalled();
    });

    it('still toggles on Enter when focus is keyboard-driven, not click-pinned (review regression case 2)', () => {
        render(<InviteLikeList initiallyFocusedItemKey="2" />);

        // Enter keyboard-navigation modality the way a real user does (Tab into the list),
        // then Enter must keep the native select/deselect behavior
        fireEvent(screen.getByTestId('selection-list-text-input'), 'keyPress', {nativeEvent: {key: 'Tab'}});
        fireEvent(screen.getByTestId('selection-list-text-input'), 'submitEditing');
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);
        expect(onConfirmMock).not.toHaveBeenCalled();
    });

    it('confirms on Enter after mixed keyboard-then-mouse input (pin reflects the LAST interaction)', () => {
        render(<InviteLikeList />);

        // User tabs (enters keyboard modality), then mouse-selects a member: the click re-enters
        // pointer modality, so Enter must confirm, not toggle the clicked row back off
        fireEvent(screen.getByTestId('selection-list-text-input'), 'keyPress', {nativeEvent: {key: 'Tab'}});
        fireEvent.press(screen.getByTestId(`${CONST.BASE_LIST_ITEM_TEST_ID}3`));
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);

        fireEvent(screen.getByTestId('selection-list-text-input'), 'focusChange', true);
        fireEvent(screen.getByTestId('selection-list-text-input'), 'submitEditing');
        expect(onConfirmMock).toHaveBeenCalledTimes(1);
        expect(onSelectRowMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing special on Enter when nothing is selected yet', () => {
        const emptySelection = memberSections.map((item) => ({...item, isSelected: false}));
        render(
            <OnyxListItemProvider>
                <BaseSelectionListWithSections
                    sections={[{data: emptySelection, sectionIndex: 0}]}
                    textInputOptions={{label: 'common.search', onChangeText: jest.fn(), value: ''}}
                    ListItem={MultiSelectListItem}
                    onSelectRow={onSelectRowMock}
                    shouldSingleExecuteRowSelect
                    shouldShowTextInput
                    canSelectMultiple
                    shouldUpdateFocusedIndex
                    confirmButtonOptions={{onConfirm: onConfirmMock, text: 'Next'}}
                />
            </OnyxListItemProvider>,
        );
        fireEvent(screen.getByTestId('selection-list-text-input'), 'submitEditing');
        expect(onConfirmMock).not.toHaveBeenCalled();
    });
});
