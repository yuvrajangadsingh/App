import {useEffect, useMemo, useRef} from 'react';
import CONST from '@src/CONST';
import type {Transaction} from '@src/types/onyx';

/**
 * This hook returns new transactions that have been added since the last transactions update.
 * This hook should be used only in the context of highlighting the new transactions on the Report table view.
 *
 * @param shouldConsume - When false, the hook still detects new transactions but won't
 *   update its baseline. This prevents the diff from being lost when the screen is unfocused
 *   (e.g. user navigated away to create an expense via FAB).
 */
function useNewTransactions(hasOnceLoadedReportActions: boolean | undefined, transactions: Transaction[] | undefined, shouldConsume: boolean = true) {
    const prevTransactionsRef = useRef<Transaction[] | undefined>(hasOnceLoadedReportActions ? transactions : undefined);

    // We need to skip the first transactions change, to avoid highlighting transactions on the first load.
    const skipFirstTransactionsChange = useRef(!hasOnceLoadedReportActions);

    const newTransactions = useMemo(() => {
        const prevTransactions = prevTransactionsRef.current;
        if (transactions === undefined || prevTransactions === undefined || transactions.length <= prevTransactions.length) {
            return CONST.EMPTY_ARRAY as unknown as Transaction[];
        }
        if (skipFirstTransactionsChange.current) {
            skipFirstTransactionsChange.current = false;
            return CONST.EMPTY_ARRAY as unknown as Transaction[];
        }
        return transactions.filter((transaction) => !prevTransactions?.some((prevTransaction) => prevTransaction.transactionID === transaction.transactionID));
        // We intentionally read prevTransactionsRef.current inside the memo without listing it as
        // a dependency. The ref is updated in the useEffect below, and we only want to recompute
        // when `transactions` changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions]);

    // Only update the baseline when the caller is ready to consume the diff.
    // When shouldConsume is false (screen unfocused), the ref stays stale so the
    // diff persists until the screen regains focus.
    useEffect(() => {
        if (shouldConsume) {
            prevTransactionsRef.current = hasOnceLoadedReportActions ? transactions : undefined;
        }
    }, [transactions, shouldConsume, hasOnceLoadedReportActions]);

    // In case when we have loaded the report, but there were no transactions in it, then we need to explicitly set skipFirstTransactionsChange to false, as it will be not set in the useMemo above.
    useEffect(() => {
        if (!hasOnceLoadedReportActions) {
            return;
        }
        // This is needed to ensure that set we skipFirstTransactionsChange to false only after the Onyx merge is done.
        new Promise<void>((resolve) => {
            resolve();
        }).then(() => {
            requestAnimationFrame(() => {
                skipFirstTransactionsChange.current = false;
            });
        });
    }, [hasOnceLoadedReportActions]);

    return newTransactions;
}

export default useNewTransactions;
