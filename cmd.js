function isMobile() { return ('ontouchstart' in document.documentElement); }
function back() {
    document.querySelector(".debut").style.display = "unset"
    document.querySelector(".apres2").style.display = "none"
    document.querySelector(".apres1").style.display = "none"
    var ins = document.querySelector(".create")
    ins.style.display = "none"
    var co = document.querySelector(".co")
    co.style.display = "none"
    if (isMobile()){
    document.querySelector("#normal").style.top = "100%"
    }
}
function inscri() {
    var ins = document.querySelector(".create")
    if (isMobile()){
        ins.style.display = "flex"
    } else{
        ins.style.display = "unset"
    }

    document.querySelector(".debut").style.display = "none"
    document.querySelector(".apres1").style.display = "unset"
    document.querySelector("#retour1").style.display = "unset"
    if (isMobile()){
        document.querySelector("#normal").style.top = "111%"
    }
   

}
function connect() {

    var co = document.querySelector(".co")
    co.style.display = "unset"
    document.querySelector(".debut").style.display = "none"
    document.querySelector(".apres2").style.display = "unset"
    document.querySelector("#retour2").style.display = "unset"
    if (isMobile()){
        document.querySelector("#normal").style.top = "105%"
    }
}
var tab = 1;
function before() {
    tab--;
    if (tab < 1) {
        tab = 5;
    }
    document.querySelector("#normal").style.display = "none";
    document.querySelector("#hard").style.display = "none";
    document.querySelector("#dark").style.display = "none";
    document.querySelector("#speed").style.display = "none";
    document.querySelector("#hell").style.display = "none";

    switch (tab) {
        case 1:
            document.querySelector("#normal").style.display = "flex";
            break;
        case 2:
            document.querySelector("#hard").style.display = "flex";
            break;
        case 3:
            document.querySelector("#dark").style.display = "flex";
            break;
        case 4:
            document.querySelector("#speed").style.display = "flex";
            break;
        case 5:
            document.querySelector("#hell").style.display = "flex";
            break;
    }
}
function next() {
    tab++;
    if (tab > 5) {
        tab = 1;
    }
    document.querySelector("#normal").style.display = "none";
    document.querySelector("#hard").style.display = "none";
    document.querySelector("#dark").style.display = "none";
    document.querySelector("#speed").style.display = "none";
    document.querySelector("#hell").style.display = "none";

    switch (tab) {
        case 1:
            document.querySelector("#normal").style.display = "flex";
            break;
        case 2:
            document.querySelector("#hard").style.display = "flex";
            break;
        case 3:
            document.querySelector("#dark").style.display = "flex";
            break;
        case 4:
            document.querySelector("#speed").style.display = "flex";
            break;
        case 5:
            document.querySelector("#hell").style.display = "flex";
            break;
    }
}