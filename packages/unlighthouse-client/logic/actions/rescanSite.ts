import {useFetch, UseFetchReturn} from "@vueuse/core";
import {apiUrl} from "../static";
import {Ref} from "vue";

export const rescanSiteRequest : Ref<UseFetchReturn<any>|null> = ref(null)

export const rescanSite = () => {
    rescanSiteRequest.value = useFetch(`${apiUrl}/reports/rescan`)
        .post()
}

export const isRescanSiteRequestRunning = computed(() => {
    return rescanSiteRequest.value?.isFetching
})
