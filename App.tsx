import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  Modal,
  Linking,
  Image,
} from 'react-native';
import RNFS from 'react-native-fs';
import * as DocumentPicker from '@react-native-documents/picker';
import Share from 'react-native-share';
import FileViewer from 'react-native-file-viewer';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbzAJIio7gmMxt_2dkHpzz_ast9Tjcl6ZrEUXuoraJDeyE-bPWR8k5aByi5BIOIsgS/exec';

const ROOT_PATH = Platform.OS === 'android'
  ? RNFS.ExternalDirectoryPath + '/Sharemypdf'
  : RNFS.DocumentDirectoryPath + '/Sharemypdf';

export default function App() {
  const [isActivated, setIsActivated] = useState(false);
  const [activationKey, setActivationKey] = useState('');
  const [companyName, setCompanyName] = useState<string>('ShareMyPDF');

  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [files, setFiles] = useState<RNFS.ReadDirItem[]>([]);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [categoryToRename, setCategoryToRename] = useState<string | null>(null);

  useEffect(() => {
    //AsyncStorage.removeItem('activated');
    AsyncStorage.getItem('activated').then(val => {
      if (val === 'true') {
        AsyncStorage.getItem('companyName').then(name => {
          if (name) setCompanyName(name);
        });
        setIsActivated(true);
        requestPermissions();
        loadCategories();
      }
    });
  }, []);

  useEffect(() => {
    if (selectedCategory) loadFiles(selectedCategory);
  }, [selectedCategory]);

  async function activateApp() {
    try {
      const deviceId = DeviceInfo.getUniqueId();
      const res = await axios.post(SHEET_API_URL, {
        activationKey: activationKey.trim(),
        deviceId,
      });

      if (res.data.success) {
        const safeName = String(res.data.companyName || 'ShareMyPDF');
        await AsyncStorage.setItem('activated', 'true');
        await AsyncStorage.setItem('companyName', safeName);
        setCompanyName(safeName);
        setIsActivated(true);
        requestPermissions();
        loadCategories();
      } else {
        Alert.alert('Activation Failed', res.data.error);
      }
    } catch (err) {
      Alert.alert('Error', 'Network or server error');
    }
  }
  async function requestPermissions() {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
    }
  }

  async function loadCategories() {
    try {
      const exists = await RNFS.exists(ROOT_PATH);
      if (!exists) await RNFS.mkdir(ROOT_PATH);
      const folders = await RNFS.readDir(ROOT_PATH);
      setCategories(folders.filter(f => f.isDirectory()).map(f => f.name));
    } catch (err) {
      Alert.alert('Error loading categories');
    }
  }

  async function loadFiles(category: string) {
    try {
      const path = `${ROOT_PATH}/${category}`;
      const items = await RNFS.readDir(path);
      setFiles(items.filter(f => f.name.endsWith('.pdf')));
    } catch (err) {
      Alert.alert('Error loading files');
    }
  }

  async function addCategory() {
    if (!newCategory) return;
    const path = `${ROOT_PATH}/${newCategory}`;
    try {
      await RNFS.mkdir(path);
      setNewCategory('');
      loadCategories();
    } catch (err) {
      Alert.alert('Error creating category');
    }
  }

  async function deleteCategory(category: string) {
    const path = `${ROOT_PATH}/${category}`;
    try {
      await RNFS.unlink(path);
      if (selectedCategory === category) setSelectedCategory(null);
      loadCategories();
    } catch (err) {
      Alert.alert('Error deleting category');
    }
  }

  async function renameCategory() {
    if (!categoryToRename || !renameInput.trim()) return;
    const oldPath = `${ROOT_PATH}/${categoryToRename}`;
    const newPath = `${ROOT_PATH}/${renameInput.trim()}`;
    try {
      await RNFS.moveFile(oldPath, newPath);
      if (selectedCategory === categoryToRename) {
        setSelectedCategory(renameInput.trim());
      }
      setRenameModalVisible(false);
      loadCategories();
    } catch (err) {
      Alert.alert('Rename error', String(err));
    }
  }

  function openRenameModal(category: string) {
    setCategoryToRename(category);
    setRenameInput(category);
    setRenameModalVisible(true);
  }

  async function addFile() {
    try {
      const [res] = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
        allowMultiSelection: false,
      });

      const fileName = res.name ?? `file-${Date.now()}.pdf`;
      const destPath = `${ROOT_PATH}/${selectedCategory}/${fileName}`;
      const base64 = await RNFS.readFile(res.uri, 'base64');
      await RNFS.writeFile(destPath, base64, 'base64');

      loadFiles(selectedCategory!);
    } catch (err: any) {
      console.log('File add error:', err);
      Alert.alert('Error adding file', err.message || String(err));
    }
  }

  async function deleteFile(file: RNFS.ReadDirItem) {
    try {
      await RNFS.unlink(file.path);
      loadFiles(selectedCategory!);
    } catch (err) {
      Alert.alert('Error deleting file');
    }
  }

  async function openPDF(file: RNFS.ReadDirItem) {
    try {
      await FileViewer.open(file.path, { showOpenWithDialog: true });
    } catch (err) {
      console.log('FileViewer error', err);
      Alert.alert('Unable to Open PDF', 'Please ensure a PDF viewer is installed.');
    }
  }

  async function shareFiles() {
    try {
      const filePaths = files.map(f => `file://${f.path}`);
      await Share.open({ title: 'Send PDFs', urls: filePaths });
    } catch (err) {
      Alert.alert('Error sharing files');
    }
  }

  const filteredCategories = categories.filter(c => c.toLowerCase().includes(search.toLowerCase()));

   if (!isActivated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#c5eaf8', justifyContent: 'center' }]}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Image
            source={require('./assets/logo.png')}
            style={{ width: 300, height: 200, resizeMode: 'contain' }}
          />
        </View>

        <View style={{ padding: 20, backgroundColor: '#c5eaf8', borderRadius: 10, margin: 20, elevation: 4 }}>
          <Text style={[styles.title, { marginBottom: 10 }]}>🔐 Enter Activation Key</Text>
          <Text style={{ fontSize: 14, color: '#555', marginBottom: 15, textAlign: 'center' }}>
            This app requires a one-time activation key.
            {'\n'}To get your key, contact {companyName}.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Unique Activation Key"
            value={activationKey}
            onChangeText={setActivationKey}
            placeholderTextColor="#999"
          />
          <Pressable style={styles.button} onPress={activateApp}>
            <Text style={styles.buttonText}>Activate</Text>
          </Pressable>
          <Text style={{ textAlign: 'center', marginTop: 10, color: '#2980b9' }}>
            📞 +91-7016498352
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.scrollContainer}>
      <View style={styles.container}>
<Text style={styles.businessHeader}>{`🧱 ${companyName} Whatsapp Tool 🧱`}</Text>
<TextInput          placeholder="Search or Add New Category (e.g. 12x18)"
          placeholderTextColor="#999"
          style={styles.input}
          value={newCategory}
          onChangeText={text => {
            setNewCategory(text);
            setSearch(text);
          }}
        />
        <Pressable style={styles.button} onPress={addCategory}>
          <Text style={styles.buttonText}>➕ ADD CATEGORY</Text>
        </Pressable>
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => item}
          horizontal
          contentContainerStyle={{ marginVertical: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.category, selectedCategory === item && styles.selectedCategory]}
              onPress={() => setSelectedCategory(item)}
              onLongPress={() => {
                Alert.alert('Category Options', `Choose an action for "${item}"`, [
                  { text: 'Rename', onPress: () => openRenameModal(item) },
                  { text: 'Delete', onPress: () => deleteCategory(item), style: 'destructive' },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
            >
              <Text style={styles.categoryText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
        {selectedCategory && (
          <>
            <Text style={styles.subTitle}>📂 PDFs in "{selectedCategory}"</Text>
            <Pressable style={styles.button} onPress={addFile}>
              <Text style={styles.buttonText}>📄 ADD PDF TO CATEGORY</Text>
            </Pressable>
            <FlatList
              data={files}
              keyExtractor={(item) => item.path}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => openPDF(item)}>
                  <View style={styles.fileCard}>
                    <Text style={styles.fileName}>{item.name}</Text>
                    <TouchableOpacity onPress={() => deleteFile(item)} style={styles.deleteBtn}>
                      <Text style={styles.deleteText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 10 }}>No PDFs found</Text>}
            />
            <Pressable style={[styles.button, { marginTop: 20 }]} onPress={shareFiles}>
              <Text style={styles.buttonText}>📤 SEND ALL VIA WHATSAPP</Text>
            </Pressable>
          </>
        )}
        <Modal visible={renameModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Rename Category</Text>
              <TextInput
                value={renameInput}
                onChangeText={setRenameInput}
                placeholder="Enter new category name"
                style={styles.input}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable style={[styles.button, { flex: 1 }]} onPress={() => setRenameModalVisible(false)}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.button, { flex: 1 }]} onPress={renameCategory}>
                  <Text style={styles.buttonText}>Rename</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <View style={{ marginTop: 30, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#999' }}>
            Made with ❤️ by Pratham Mehta ||{' '}
            <Text
              style={{ color: '#2980b9', textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('tel:+917016498352')}
            >
              Contact: +91-7016498352
            </Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flex: 1, backgroundColor: '#f0f2f5' },
  container: { flex: 1, padding: 20 },
  businessHeader: { fontSize: 20, fontWeight: '600', color: '#2980b9', marginBottom: 5, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, color: '#34495e', textAlign: 'center' },
  subTitle: { fontSize: 18, fontWeight: '600', marginTop: 10, marginBottom: 5, color: '#2c3e50' },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#fff',
    color: '#000',
  },
  button: {
    backgroundColor: '#3498db',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  category: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    backgroundColor: '#dcdde1',
    marginRight: 6,
    borderRadius: 16,
    height: 32,
    minWidth: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCategory: {
    backgroundColor: '#7ec8e3',
  },
  categoryText: {
    color: '#2c3e50',
    fontWeight: '600',
    fontSize: 14,
  },
  fileCard: {
    backgroundColor: '#fff',
    padding: 12,
    marginVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: '#ddd',
    borderWidth: 1,
  },
  fileName: { color: '#2d3436', fontSize: 16, flex: 1 },
  deleteBtn: { marginLeft: 10, padding: 5 },
  deleteText: { color: '#e74c3c', fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
