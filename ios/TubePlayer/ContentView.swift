import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            SearchView()
                .tabItem { Label("Watch", systemImage: "play.rectangle") }
            LibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
